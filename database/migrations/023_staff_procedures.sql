-- 023_staff_procedures.sql
-- Owner: Dev2  |  Issue: CATMS-023  |  Depends on: 021_staff_and_manager_assignments.sql, 022_doctor_specialty_user_and_role.sql
--
-- Implements controlled transactional procedures for:
--   - catms.register_employee: Atomic creation of employee, initial primary branch assignment, user account, role & audit log
--   - catms.register_doctor_profile: Atomic creation of 1:1 doctor profile subtype, specialties attachment, and doctor position validation
--   - catms.transfer_employee_branch / catms.assign_employee_branch: Atomic branch reassignment closing old assignment and opening new
--   - catms.deactivate_employee: Soft-deactivation closing assignments, disabling user account & doctor appointments, retaining full history
--   - Grants to catms_app and migration tracking

BEGIN;

-- =============================================================================
-- Procedure: catms.register_employee
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.register_employee(
    p_employee_number     CITEXT,
    p_nic                 CITEXT,
    p_full_name           VARCHAR(150),
    p_gender_code         VARCHAR(20),
    p_date_of_birth       DATE,
    p_position_code       VARCHAR(30),
    p_phone               VARCHAR(25),
    p_branch_id           BIGINT,
    p_email               CITEXT DEFAULT NULL,
    p_hire_date           DATE DEFAULT CURRENT_DATE,
    p_assignment_type     VARCHAR(20) DEFAULT 'PRIMARY',
    p_username            CITEXT DEFAULT NULL,
    p_password_hash       TEXT DEFAULT NULL,
    p_role_code           CITEXT DEFAULT NULL,
    p_assigned_by_user_id BIGINT DEFAULT NULL,
    INOUT p_employee_id   BIGINT DEFAULT NULL,
    INOUT p_user_account_id BIGINT DEFAULT NULL,
    INOUT p_assignment_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_emp_number CITEXT;
    v_username CITEXT;
    v_password_hash TEXT;
    v_role_code CITEXT;
    v_app_role_id SMALLINT;
    v_scope_branch_id BIGINT;
    v_branch_active BOOLEAN;
BEGIN
    -- 1. Validate destination branch exists and is active
    SELECT is_active INTO v_branch_active
    FROM catms.branch
    WHERE branch_id = p_branch_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch with ID % does not exist', p_branch_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_branch_active = FALSE THEN
        RAISE EXCEPTION 'Cannot assign employee to inactive branch %', p_branch_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Validate mandatory attributes
    IF p_nic IS NULL OR length(trim(p_nic)) = 0 THEN
        RAISE EXCEPTION 'NIC cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN
        RAISE EXCEPTION 'Full name cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
        RAISE EXCEPTION 'Phone cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    IF p_date_of_birth >= CURRENT_DATE THEN
        RAISE EXCEPTION 'Date of birth must be in the past' USING ERRCODE = 'check_violation';
    END IF;

    -- 3. Resolve employee number (generate if not provided)
    IF p_employee_number IS NULL OR length(trim(p_employee_number)) = 0 THEN
        v_emp_number := 'EMP-' || upper(substr(coalesce(p_position_code, 'STAFF'), 1, 3)) || '-' || to_char(coalesce(p_hire_date, CURRENT_DATE), 'YYYY') || '-' || lpad(floor(random() * 9000 + 1000)::text, 4, '0');
    ELSE
        v_emp_number := trim(p_employee_number);
    END IF;

    -- 4. Insert Employee Record
    INSERT INTO catms.employee (
        employee_number,
        nic,
        full_name,
        gender_code,
        date_of_birth,
        position_code,
        phone,
        email,
        hire_date,
        employment_status,
        is_active
    ) VALUES (
        v_emp_number,
        trim(p_nic),
        trim(p_full_name),
        trim(p_gender_code),
        p_date_of_birth,
        trim(p_position_code),
        trim(p_phone),
        p_email,
        coalesce(p_hire_date, CURRENT_DATE),
        'Active',
        TRUE
    ) RETURNING employee_id INTO p_employee_id;

    -- 5. Insert Primary Branch Assignment
    INSERT INTO catms.employee_branch_assignment (
        employee_id,
        branch_id,
        assignment_type,
        valid_from,
        valid_to,
        is_active,
        assigned_by_user_id
    ) VALUES (
        p_employee_id,
        p_branch_id,
        upper(coalesce(p_assignment_type, 'PRIMARY')),
        coalesce(p_hire_date, CURRENT_DATE),
        NULL,
        TRUE,
        p_assigned_by_user_id
    ) RETURNING employee_branch_assignment_id INTO p_assignment_id;

    -- 6. Insert User Account (atomic credential provision)
    v_username := coalesce(trim(p_username), lower(replace(v_emp_number, ' ', '')));
    v_password_hash := coalesce(p_password_hash, '$2b$12$e8Yk1.Kq9O2jM4jV6jQ8Nu8F/0kQ5lM1yZ7h9o8x7p6');

    INSERT INTO catms.user_account (
        employee_id,
        username,
        password_hash,
        account_status
    ) VALUES (
        p_employee_id,
        v_username,
        v_password_hash,
        'Active'
    ) RETURNING user_account_id INTO p_user_account_id;

    -- 7. Assign App Role in user_account_role
    v_role_code := p_role_code;
    IF v_role_code IS NULL THEN
        -- Derive canonical role from position
        CASE upper(trim(p_position_code))
            WHEN 'DOCTOR'       THEN v_role_code := 'Clinician';
            WHEN 'RECEPTIONIST' THEN v_role_code := 'Reception';
            WHEN 'MANAGER'      THEN v_role_code := 'Manager';
            WHEN 'ADMIN'        THEN v_role_code := 'Admin';
            ELSE v_role_code := NULL;
        END CASE;
    END IF;

    IF v_role_code IS NOT NULL THEN
        SELECT app_role_id INTO v_app_role_id
        FROM catms.app_role
        WHERE upper(role_code) = upper(v_role_code);

        IF FOUND THEN
            -- Branch scoping: Admin/QA are clinic-wide (NULL), others scoped to branch
            IF upper(v_role_code) IN ('ADMIN', 'QA') THEN
                v_scope_branch_id := NULL;
            ELSE
                v_scope_branch_id := p_branch_id;
            END IF;

            INSERT INTO catms.user_account_role (
                user_account_id,
                app_role_id,
                branch_scope_id,
                valid_from,
                assigned_by_user_id
            ) VALUES (
                p_user_account_id,
                v_app_role_id,
                v_scope_branch_id,
                now(),
                p_assigned_by_user_id
            );
        END IF;
    END IF;

    -- 8. Record Audit Event
    INSERT INTO catms.audit_event (
        actor_user_id,
        entity_type,
        entity_id,
        action_code,
        payload
    ) VALUES (
        p_assigned_by_user_id,
        'EMPLOYEE',
        p_employee_id::text,
        'EMPLOYEE_REGISTERED',
        jsonb_build_object(
            'employee_number', v_emp_number,
            'position_code', p_position_code,
            'branch_id', p_branch_id,
            'user_account_id', p_user_account_id,
            'assignment_id', p_assignment_id
        )
    );
END;
$$;

-- =============================================================================
-- Procedure: catms.register_doctor_profile
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.register_doctor_profile(
    p_employee_id              BIGINT,
    p_medical_license_no       CITEXT,
    p_practice_start_date      DATE DEFAULT CURRENT_DATE,
    p_default_consultation_fee NUMERIC(12,2) DEFAULT NULL,
    p_specialty_ids            BIGINT[] DEFAULT ARRAY[]::BIGINT[],
    p_primary_specialty_id     BIGINT DEFAULT NULL,
    p_assigned_by_user_id      BIGINT DEFAULT NULL,
    INOUT p_doctor_id          BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_emp_pos VARCHAR(30);
    v_emp_active BOOLEAN;
    v_spec_id BIGINT;
    v_is_primary BOOLEAN;
    v_first_specialty BOOLEAN := TRUE;
    v_user_acct_id BIGINT;
    v_clinician_role_id SMALLINT;
    v_branch_id BIGINT;
BEGIN
    -- 1. Validate employee exists
    SELECT position_code, is_active
    INTO v_emp_pos, v_emp_active
    FROM catms.employee
    WHERE employee_id = p_employee_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Employee with ID % does not exist', p_employee_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- 2. Enforce invariant: Doctor profile requires position_code = 'Doctor'
    IF upper(trim(v_emp_pos)) <> 'DOCTOR' THEN
        RAISE EXCEPTION 'Employee % has position ''%''; registering a doctor profile requires position ''Doctor''',
            p_employee_id, v_emp_pos
            USING ERRCODE = 'check_violation';
    END IF;

    -- 3. Enforce active employee
    IF v_emp_active = FALSE THEN
        RAISE EXCEPTION 'Cannot register doctor profile for inactive employee %', p_employee_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- 4. Check for existing doctor profile (1:1 subtype)
    IF EXISTS (SELECT 1 FROM catms.doctor_profile WHERE doctor_id = p_employee_id) THEN
        RAISE EXCEPTION 'Doctor profile already exists for employee %', p_employee_id
            USING ERRCODE = 'unique_violation';
    END IF;

    -- 5. Validate medical license
    IF p_medical_license_no IS NULL OR length(trim(p_medical_license_no)) = 0 THEN
        RAISE EXCEPTION 'Medical license number cannot be empty'
            USING ERRCODE = 'check_violation';
    END IF;

    -- 6. Validate consultation fee
    IF p_default_consultation_fee IS NOT NULL AND p_default_consultation_fee < 0 THEN
        RAISE EXCEPTION 'Default consultation fee cannot be negative: %', p_default_consultation_fee
            USING ERRCODE = 'check_violation';
    END IF;

    -- 7. Validate practice start date
    IF p_practice_start_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Practice start date cannot be in the future: %', p_practice_start_date
            USING ERRCODE = 'check_violation';
    END IF;

    -- 8. Insert Doctor Profile record
    INSERT INTO catms.doctor_profile (
        doctor_id,
        medical_license_no,
        practice_start_date,
        default_consultation_fee,
        is_accepting_appointments
    ) VALUES (
        p_employee_id,
        trim(p_medical_license_no),
        coalesce(p_practice_start_date, CURRENT_DATE),
        p_default_consultation_fee,
        TRUE
    );

    -- 9. Attach Specialties
    IF p_specialty_ids IS NOT NULL AND array_length(p_specialty_ids, 1) > 0 THEN
        FOREACH v_spec_id IN ARRAY p_specialty_ids
        LOOP
            IF NOT EXISTS (SELECT 1 FROM catms.specialty WHERE specialty_id = v_spec_id AND is_active = TRUE) THEN
                RAISE EXCEPTION 'Specialty with ID % does not exist or is inactive', v_spec_id
                    USING ERRCODE = 'foreign_key_violation';
            END IF;

            IF p_primary_specialty_id IS NOT NULL THEN
                v_is_primary := (v_spec_id = p_primary_specialty_id);
            ELSE
                v_is_primary := v_first_specialty;
            END IF;

            INSERT INTO catms.doctor_specialty (
                doctor_id,
                specialty_id,
                is_primary,
                valid_from,
                valid_to
            ) VALUES (
                p_employee_id,
                v_spec_id,
                v_is_primary,
                CURRENT_DATE,
                NULL
            );

            v_first_specialty := FALSE;
        END LOOP;
    END IF;

    -- 10. Ensure Clinician Role on user account
    SELECT user_account_id INTO v_user_acct_id
    FROM catms.user_account
    WHERE employee_id = p_employee_id;

    IF FOUND THEN
        SELECT app_role_id INTO v_clinician_role_id
        FROM catms.app_role
        WHERE upper(role_code) = 'CLINICIAN';

        IF FOUND THEN
            SELECT branch_id INTO v_branch_id
            FROM catms.employee_branch_assignment
            WHERE employee_id = p_employee_id
              AND is_active = TRUE
              AND upper(assignment_type) = 'PRIMARY'
            ORDER BY valid_from DESC
            LIMIT 1;

            INSERT INTO catms.user_account_role (
                user_account_id,
                app_role_id,
                branch_scope_id,
                valid_from,
                assigned_by_user_id
            ) VALUES (
                v_user_acct_id,
                v_clinician_role_id,
                v_branch_id,
                now(),
                p_assigned_by_user_id
            )
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    -- 11. Record Audit Event
    INSERT INTO catms.audit_event (
        actor_user_id,
        entity_type,
        entity_id,
        action_code,
        payload
    ) VALUES (
        p_assigned_by_user_id,
        'DOCTOR_PROFILE',
        p_employee_id::text,
        'DOCTOR_REGISTERED',
        jsonb_build_object(
            'medical_license_no', p_medical_license_no,
            'fee', p_default_consultation_fee,
            'practice_start_date', p_practice_start_date,
            'specialties', p_specialty_ids
        )
    );

    p_doctor_id := p_employee_id;
END;
$$;

-- =============================================================================
-- Procedure: catms.transfer_employee_branch
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.transfer_employee_branch(
    p_employee_id         BIGINT,
    p_new_branch_id       BIGINT,
    p_assignment_type     VARCHAR(20) DEFAULT 'PRIMARY',
    p_effective_date      DATE DEFAULT CURRENT_DATE,
    p_assigned_by_user_id BIGINT DEFAULT NULL,
    INOUT p_new_assignment_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_emp_active BOOLEAN;
    v_branch_active BOOLEAN;
    v_type VARCHAR(20);
    v_old_assignment_id BIGINT;
    v_old_branch_id BIGINT;
BEGIN
    -- 1. Validate employee
    SELECT is_active INTO v_emp_active
    FROM catms.employee
    WHERE employee_id = p_employee_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Employee with ID % does not exist', p_employee_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_emp_active = FALSE THEN
        RAISE EXCEPTION 'Cannot transfer inactive employee %', p_employee_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Validate destination branch
    SELECT is_active INTO v_branch_active
    FROM catms.branch
    WHERE branch_id = p_new_branch_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch with ID % does not exist', p_new_branch_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_branch_active = FALSE THEN
        RAISE EXCEPTION 'Cannot transfer employee to inactive branch %', p_new_branch_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- 3. Resolve assignment type
    v_type := upper(trim(coalesce(p_assignment_type, 'PRIMARY')));
    IF v_type NOT IN ('PRIMARY', 'TEMPORARY', 'SECONDARY') THEN
        RAISE EXCEPTION 'Invalid assignment type: %. Must be PRIMARY, TEMPORARY, or SECONDARY', p_assignment_type
            USING ERRCODE = 'check_violation';
    END IF;

    -- 4. For PRIMARY assignment: atomically close previous active PRIMARY assignment
    IF v_type = 'PRIMARY' THEN
        SELECT employee_branch_assignment_id, branch_id
        INTO v_old_assignment_id, v_old_branch_id
        FROM catms.employee_branch_assignment
        WHERE employee_id = p_employee_id
          AND is_active = TRUE
          AND upper(assignment_type) = 'PRIMARY';

        IF FOUND THEN
            IF v_old_branch_id = p_new_branch_id THEN
                RAISE EXCEPTION 'Employee % is already actively assigned to branch % as PRIMARY',
                    p_employee_id, p_new_branch_id
                    USING ERRCODE = 'check_violation';
            END IF;

            UPDATE catms.employee_branch_assignment
            SET valid_to = p_effective_date,
                is_active = FALSE,
                updated_at = now()
            WHERE employee_branch_assignment_id = v_old_assignment_id;
        END IF;
    ELSE
        -- Non-primary assignment: reject if identical active assignment already exists
        IF EXISTS (
            SELECT 1 FROM catms.employee_branch_assignment
            WHERE employee_id = p_employee_id
              AND branch_id = p_new_branch_id
              AND upper(assignment_type) = v_type
              AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'Employee % already has an active % assignment at branch %',
                p_employee_id, v_type, p_new_branch_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 5. Insert new assignment
    INSERT INTO catms.employee_branch_assignment (
        employee_id,
        branch_id,
        assignment_type,
        valid_from,
        valid_to,
        is_active,
        assigned_by_user_id
    ) VALUES (
        p_employee_id,
        p_new_branch_id,
        v_type,
        coalesce(p_effective_date, CURRENT_DATE),
        NULL,
        TRUE,
        p_assigned_by_user_id
    ) RETURNING employee_branch_assignment_id INTO p_new_assignment_id;

    -- 6. Update user role branch scope if primary transfer and scoped to old branch
    IF v_type = 'PRIMARY' AND v_old_branch_id IS NOT NULL THEN
        UPDATE catms.user_account_role
        SET branch_scope_id = p_new_branch_id
        WHERE user_account_id IN (
            SELECT user_account_id FROM catms.user_account WHERE employee_id = p_employee_id
        )
        AND branch_scope_id = v_old_branch_id
        AND (valid_to IS NULL OR valid_to >= now());
    END IF;

    -- 7. Audit Event
    INSERT INTO catms.audit_event (
        actor_user_id,
        entity_type,
        entity_id,
        action_code,
        payload
    ) VALUES (
        p_assigned_by_user_id,
        'EMPLOYEE_BRANCH_ASSIGNMENT',
        p_employee_id::text,
        'BRANCH_TRANSFERRED',
        jsonb_build_object(
            'old_branch_id', v_old_branch_id,
            'new_branch_id', p_new_branch_id,
            'assignment_type', v_type,
            'effective_date', p_effective_date,
            'new_assignment_id', p_new_assignment_id
        )
    );
END;
$$;

-- Synonym procedure
CREATE OR REPLACE PROCEDURE catms.assign_employee_branch(
    p_employee_id         BIGINT,
    p_branch_id           BIGINT,
    p_assignment_type     VARCHAR(20) DEFAULT 'PRIMARY',
    p_effective_date      DATE DEFAULT CURRENT_DATE,
    p_assigned_by_user_id BIGINT DEFAULT NULL,
    INOUT p_assignment_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    CALL catms.transfer_employee_branch(
        p_employee_id,
        p_branch_id,
        p_assignment_type,
        p_effective_date,
        p_assigned_by_user_id,
        p_assignment_id
    );
END;
$$;

-- =============================================================================
-- Procedure: catms.deactivate_employee
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.deactivate_employee(
    p_employee_id             BIGINT,
    p_reason                  VARCHAR(255) DEFAULT 'Staff deactivation',
    p_deactivated_by_user_id  BIGINT DEFAULT NULL,
    p_effective_date          DATE DEFAULT CURRENT_DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_acct_id BIGINT;
    v_effective_date DATE;
BEGIN
    v_effective_date := coalesce(p_effective_date, CURRENT_DATE);

    -- 1. Validate employee exists
    IF NOT EXISTS (SELECT 1 FROM catms.employee WHERE employee_id = p_employee_id) THEN
        RAISE EXCEPTION 'Employee with ID % does not exist', p_employee_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- 2. Soft-deactivate employee (historical record preserved)
    UPDATE catms.employee
    SET is_active = FALSE,
        employment_status = 'Inactive',
        terminated_at = coalesce(terminated_at, v_effective_date),
        updated_at = now()
    WHERE employee_id = p_employee_id;

    -- 3. Close active branch assignments
    UPDATE catms.employee_branch_assignment
    SET is_active = FALSE,
        valid_to = coalesce(valid_to, v_effective_date),
        updated_at = now()
    WHERE employee_id = p_employee_id
      AND is_active = TRUE;

    -- 4. Close active branch manager assignments
    UPDATE catms.branch_manager_assignment
    SET is_active = FALSE,
        valid_to = coalesce(valid_to, v_effective_date),
        reason = CASE
            WHEN reason IS NULL OR length(trim(reason)) = 0 THEN 'Deactivated: ' || coalesce(p_reason, 'Staff deactivation')
            ELSE reason || '; Deactivated: ' || coalesce(p_reason, 'Staff deactivation')
        END,
        updated_at = now()
    WHERE employee_id = p_employee_id
      AND is_active = TRUE;

    -- 5. Disable doctor appointments and close doctor specialties if doctor
    IF EXISTS (SELECT 1 FROM catms.doctor_profile WHERE doctor_id = p_employee_id) THEN
        UPDATE catms.doctor_profile
        SET is_accepting_appointments = FALSE,
            updated_at = now()
        WHERE doctor_id = p_employee_id;

        UPDATE catms.doctor_specialty
        SET valid_to = coalesce(valid_to, v_effective_date)
        WHERE doctor_id = p_employee_id
          AND (valid_to IS NULL OR valid_to > v_effective_date);
    END IF;

    -- 6. Disable user account and expire active roles
    SELECT user_account_id INTO v_user_acct_id
    FROM catms.user_account
    WHERE employee_id = p_employee_id;

    IF FOUND THEN
        UPDATE catms.user_account
        SET account_status = 'Disabled',
            status = 'Disabled',
            updated_at = now()
        WHERE user_account_id = v_user_acct_id;

        UPDATE catms.user_account_role
        SET valid_to = coalesce(valid_to, now())
        WHERE user_account_id = v_user_acct_id
          AND (valid_to IS NULL OR valid_to > now());
    END IF;

    -- 7. Audit Event
    INSERT INTO catms.audit_event (
        actor_user_id,
        entity_type,
        entity_id,
        action_code,
        payload
    ) VALUES (
        p_deactivated_by_user_id,
        'EMPLOYEE',
        p_employee_id::text,
        'EMPLOYEE_DEACTIVATED',
        jsonb_build_object(
            'reason', coalesce(p_reason, 'Staff deactivation'),
            'effective_date', v_effective_date
        )
    );
END;
$$;

-- =============================================================================
-- COMMENT ON Statements
-- =============================================================================

COMMENT ON PROCEDURE catms.register_employee IS
  'Atomically registers an employee, initial primary branch assignment, user account, role and audit event.';

COMMENT ON PROCEDURE catms.register_doctor_profile IS
  'Atomically creates doctor profile subtype for an employee with position Doctor, attaching medical specialties and role.';

COMMENT ON PROCEDURE catms.transfer_employee_branch IS
  'Atomically transfers an employee between branches, closing existing active primary assignment and syncing role scope.';

COMMENT ON PROCEDURE catms.assign_employee_branch IS
  'Alias/synonym for catms.transfer_employee_branch.';

COMMENT ON PROCEDURE catms.deactivate_employee IS
  'Soft-deactivates an employee, closing assignments, disabling user account & doctor appointments, retaining full history.';

-- =============================================================================
-- Permissions & Grants
-- =============================================================================

GRANT EXECUTE ON PROCEDURE catms.register_employee TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.register_doctor_profile TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.transfer_employee_branch TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.assign_employee_branch TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.deactivate_employee TO catms_app;

-- =============================================================================
-- Migration Tracking
-- =============================================================================

INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (23, 'implement staff registration assignment and deactivation procedures', current_user)
ON CONFLICT (version) DO NOTHING;

COMMIT;
