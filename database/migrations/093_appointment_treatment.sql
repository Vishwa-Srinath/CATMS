--dev4
-- catms-033
--delivered treatment and price snapshots

begin;

create table catms.appointment_treatment (
    appointment_treatment_id bigint generated always as identity,
    appointment_id bigint not null,
    treatment_id bigint not null,
    line_number smallint not null,
    quantity numeric(8,2) not null,
    unit_price_at_time numeric(12,2) not null,
    price_source varchar(20) not null,
    administered_at timestamptz not null,
    recorded_by_user_id bigint not null,
    clinical_comment varchar(300),
    created_at timestamptz NOT NULL DEFAULT now(),

    constraint pk_appointment_treatment 
        primary key (appointment_treatment_id),
    
    constraint fk_appointment_treatment_appointment
        foreign key (appointment_id)
        references catms.appointment(appointment_id)
        on delete restrict,

    constraint fk_appointment_treatment_catalogue
        foreign key (treatment_id)
        references catms.treatment_catalogue(treatment_id)
        on delete restrict,
    
    constraint fk_appointment_treatment_user
        foreign key (recorded_by_user_id)
        references catms.user_account(user_account_id)
        on delete restrict,
    
    constraint uq_appointment_treatment_line
        unique (appointment_id, line_number),
    
    constraint chk_appointment_treatment_line_positive
        check (line_number > 0),

    constraint chk_appointment_treatment_quantity
        check (
            quantity > 0
            and quantity <> 'NaN'::numeric
        ),
    
    constraint chk_appointment_treatment_price
        check (
            unit_price_at_time >= 0
            and unit_price_at_time <> 'NaN'::numeric
        )
);

alter table catms.appointment_treatment
ADD CONSTRAINT chk_appointment_price_source
    check (
        price_source in (
            'Catalogue',
            'DoctorFee',
            'ApprovedOverride'
        )
    );

COMMENT ON TABLE catms.appointment_treatment IS
    'Treatments delivered during an appointment, with quantity and historical unit-price snapshots.';

COMMENT ON COLUMN catms.appointment_treatment.unit_price_at_time IS
    'Unit price captured by database logic when the treatment is recorded; later price changes must not alter this value.';

COMMENT ON COLUMN catms.appointment_treatment.price_source IS
    'Origin of the captured price: Catalogue, DoctorFee, or ApprovedOverride.';


create function catms.record_appointment_treatment (
    p_appointment_id bigint,
    p_treatment_id bigint,
    p_quantity numeric,
    p_recorded_by_user_id bigint,
    p_clinical_comment text default null,
    p_administered_at timestamptz default now()
)
returns bigint
language plpgsql
AS $$
declare
    v_status catms.appointment_status;
    v_doctor_id bigint;
    v_is_consultation boolean;
    v_active BOOLEAN;
    v_catalogue_price numeric;
    v_doctor_fee numeric;
    v_unit_price numeric;
    v_price_source varchar(20);
    v_line_number integer;
    v_appointment_treatment_id bigint;
begin
    -- lock appointment to coordinate treatment_line numbering
    select status, doctor_id
    into v_status, v_doctor_id
    from catms.appointment
    where appointment_id = p_appointment_id
    for update;

    if not found then
        raise exception 
            'appointment_not_found: the appointment does not exist,';
    end if;

    if v_status <> 'Completed' then
        raise exception
            'treatment_requires_completed: appointment must be completed,';
    end if;

    -- read and protect the treatment during price capturing
    select is_active, is_consultation_service, current_price
    into v_active, v_is_consultation, v_catalogue_price
    from catms.treatment_catalogue
    where treatment_id = p_treatment_id
    for share;

    if not found then
        raise exception 
            'treatment_not_found: the treatment does not exist,';
    end if;

    if not v_active then
        raise exception 
            'treatment_inactive: the treatment is inactive,';
    end if;

    -- reject invalid quantity values
    if p_quantity is null
        or p_quantity <= 0
        or p_quantity = 'NaN'::numeric then
            raise exception 
                'invalid_quantity: quantity must be a positive number,';
    end if;

    if p_clinical_comment is not null
        and length(p_clinical_comment) > 300 then
            raise exception 
                'clinical_comment_too_long: clinical comment exceeds 300 characters,';
    end if;

    -- catalogue price is the default
    v_unit_price  := v_catalogue_price;
    v_price_source := 'Catalogue';

    --only condultation service may use the appointment doctor's fee.
    if v_is_consultation then
        select default_consultation_fee
        into v_doctor_fee
        from catms.doctor_profile
        where doctor_id = v_doctor_id
        for share;
    
        if v_doctor_fee is not null then
            v_unit_price := v_doctor_fee;
            v_price_source := 'DoctorFee';
        end if;
    end if;

    select coalesce(max(line_number), 0) + 1
    into v_line_number
    from catms.appointment_treatment
    where appointment_id = p_appointment_id;

    if v_line_number > 32767 then
        raise exception 
            'line_number_exceeded: maximum number of treatments for this appointment exceeded,';
    end if;

    insert into catms.appointment_treatment (
        appointment_id,
        treatment_id,
        line_number,
        quantity,
        unit_price_at_time,
        price_source,
        administered_at,
        recorded_by_user_id,
        clinical_comment
    ) values (
        p_appointment_id,
        p_treatment_id,
        v_line_number,
        p_quantity,
        v_unit_price,
        v_price_source,
        p_administered_at,
        p_recorded_by_user_id,
        p_clinical_comment
    )
    returning appointment_treatment_id
    into v_appointment_treatment_id;

    return v_appointment_treatment_id;
end;
$$;

COMMENT ON FUNCTION catms.record_appointment_treatment(
    BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TIMESTAMPTZ
) IS
    'Records a treatment for a Completed appointment, selecting and storing the applicable price in the database.';

revoke all on function catms.record_appointment_treatment(
    BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TIMESTAMPTZ
) from public; 

create function catms.protect_treatment_price_snapshot()
returns trigger
language plpgsql
AS $$
begin
    if new.unit_price_at_time is distinct from old.unit_price_at_time 
        or new.price_source is distinct from old.price_source then
            raise exception 
                'treatment_price_snapshot_protected: unit price snapshot cannot be modified,';
    end if;

    return new;
end;
$$;

create trigger protect_treatment_price_snapshot
    before update on catms.appointment_treatment
    for each row
    execute function catms.protect_treatment_price_snapshot();

comment on function catms.protect_treatment_price_snapshot() is
    'Prevents modification of the unit price and price source for delivered treatments.';


create function catms.guard_appointment_treatment_insert()
returns trigger
language plpgsql
as $$
declare 
    v_status catms.appointment_status;
    v_doctor_id bigint;
    v_active BOOLEAN;
    v_is_consultation boolean;
    v_expected_price numeric;
    v_expected_source varchar(20);
    v_doctor_fee numeric;

begin
    --use the same lock order as the recording fumction
    --appointment, catalogue, then doctor
    select status, doctor_id
    into v_status, v_doctor_id
    from catms.appointment
    where appointment_id = new.appointment_id
    for update;

    if not found then
        raise exception 
            'appointment_not_found: the appointment does not exist,';
    end if;

    if v_status <> 'Completed' then
        raise exception
            'treatment_requires_completed: appointment must be completed,';
    end if;

    select is_active, is_consultation_service, current_price
    into v_active, v_is_consultation, v_expected_price
    from catms.treatment_catalogue
    where treatment_id = new.treatment_id
    for share;

    if not found then
        raise exception 
            'treatment_not_found: the treatment does not exist,';
    end if;

    if not v_active then
        raise exception 
            'treatment_inactive: the treatment is inactive,';
    end if;
    
    v_expected_source := 'Catalogue';
    if v_is_consultation then
        select default_consultation_fee
        into v_doctor_fee
        from catms.doctor_profile
        where doctor_id = v_doctor_id
        for share;

        if v_doctor_fee is not null then
            v_expected_price := v_doctor_fee;
            v_expected_source := 'DoctorFee';
        end if;
    end if;

    -- no approved override workflow has been implemented yet,
    if new.price_source = 'ApprovedOverride' then
        raise exception 
            'treatment_requires_approval: price source ApprovedOverride is not allowed for direct inserts,';
    end if;

    IF NEW.unit_price_at_time IS DISTINCT FROM v_expected_price
       OR NEW.price_source IS DISTINCT FROM v_expected_source THEN
        RAISE EXCEPTION
            'INVALID_TREATMENT_PRICE: Price and source must match the database pricing rule.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_appointment_treatment_insert
BEFORE INSERT
ON catms.appointment_treatment
FOR EACH ROW
EXECUTE FUNCTION catms.guard_appointment_treatment_insert();

COMMENT ON FUNCTION catms.guard_appointment_treatment_insert() IS
    'Validates Completed status, active treatment, and the applicable price snapshot before insertion.';


-- Application roles cannot directly modify delivered-treatment rows.
REVOKE ALL ON TABLE catms.appointment_treatment
FROM PUBLIC,
     catms_app,
     catms_clinician,
     catms_admin,
     catms_reception,
     catms_manager,
     catms_qa,
     catms_readonly;

GRANT SELECT ON TABLE catms.appointment_treatment
TO catms_app,
   catms_clinician,
   catms_admin,
   catms_qa,
   catms_readonly;

-- The controlled function performs writes using its trusted owner's rights.
ALTER FUNCTION catms.record_appointment_treatment(
    BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TIMESTAMPTZ
)
SECURITY DEFINER;

ALTER FUNCTION catms.record_appointment_treatment(
    BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TIMESTAMPTZ
)
SET search_path = pg_catalog, pg_temp;

REVOKE ALL ON FUNCTION catms.record_appointment_treatment(
    BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TIMESTAMPTZ
)
FROM PUBLIC, catms_reception, catms_manager,
     catms_qa, catms_readonly;

GRANT EXECUTE ON FUNCTION catms.record_appointment_treatment(
    BIGINT, BIGINT, NUMERIC, BIGINT, TEXT, TIMESTAMPTZ
)
TO catms_app, catms_clinician, catms_admin;

commit;