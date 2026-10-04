-- dev4
-- catms-020
-- Create treatment catalogue table

begin;

create table catms.treatment_catalogue (
    treatment_id bigint generated always as identity,
    treatment_category_id bigint not null,
    service_code citext not null,
    name varchar(120) not null,
    description varchar(300),
    current_price numeric(12,2) not null,
    default_duration_minutes smallint not null,
    is_consultation_service boolean not null default false,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    
    constraint pk_treatment_catalogue primary key (treatment_id),
    constraint fk_treatment_catalogue_treatment_category foreign key (treatment_category_id) references catms.treatment_category (treatment_category_id) on delete restrict,
    constraint uq_treatment_catagory_service_code unique(service_code),
    constraint chk_treatment_catalogue_service_code_nonempty check (length(trim(service_code)) > 0),
    constraint chk_treatment_catalogue_name_nonempty check (length(trim(name)) > 0),
    constraint chk_treatment_catalogue_price check(current_price >= 0 and current_price <> 'NaN'::numeric),
    constraint chk_treatment_catalogue_duration check(default_duration_minutes > 0)

);

create index idx_treatment_catalogue_treatment_category_id 
    on catms.treatment_catalogue (treatment_category_id);

create function catms.touch_treatment_catalogue_updated_at()
returns trigger 
language plpgsql as $$
begin 
    new.updated_at := now();
    return new;
end;
$$;

create trigger trg_treatment_catalogue_updated_at
before update on catms.treatment_catalogue
for each row execute function catms.touch_treatment_catalogue_updated_at();

do $$
begin
    if to_regclass('catms.policy_coverage') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'fk_policy_coverage_treatment'
             and conrelid = 'catms.policy_coverage'::regclass
       )
    then
        alter table catms.policy_coverage
            add constraint fk_policy_coverage_treatment
            foreign key (treatment_id)
            references catms.treatment_catalogue (treatment_id) on delete restrict;
    end if;
end;
$$;

COMMENT ON TABLE catms.treatment_catalogue IS
    'Current treatment definitions and prices; delivered care stores separate snapshots.';
COMMENT ON COLUMN catms.treatment_catalogue.treatment_id IS
    'Automatically generated treatment identifier.';
COMMENT ON COLUMN catms.treatment_catalogue.treatment_category_id IS
    'Category containing this treatment; referenced categories cannot be deleted.';
COMMENT ON COLUMN catms.treatment_catalogue.service_code IS
    'Unique case-insensitive service code.';
COMMENT ON COLUMN catms.treatment_catalogue.name IS
    'Treatment display name.';
COMMENT ON COLUMN catms.treatment_catalogue.description IS
    'Optional treatment description.';
COMMENT ON COLUMN catms.treatment_catalogue.current_price IS
    'Current catalogue unit price in LKR; finite and non-negative.';
COMMENT ON COLUMN catms.treatment_catalogue.default_duration_minutes IS
    'Default service duration in whole minutes; must be positive.';
COMMENT ON COLUMN catms.treatment_catalogue.is_consultation_service IS
    'Marks services eligible for the agreed doctor consultation-fee rule.';
COMMENT ON COLUMN catms.treatment_catalogue.is_active IS
    'Whether available for new care entries; existing references are retained.';
COMMENT ON COLUMN catms.treatment_catalogue.created_at IS
    'Creation instant.';
COMMENT ON COLUMN catms.treatment_catalogue.updated_at IS
    'Transaction timestamp refreshed on row update.';
COMMENT ON INDEX catms.idx_treatment_catalogue_treatment_category_id IS
    'Supports category lookups and checking referencing treatments.';
COMMENT ON FUNCTION catms.touch_treatment_catalogue_updated_at() IS
    'Maintains the catalogue update timestamp.';
COMMENT ON TRIGGER trg_treatment_catalogue_updated_at ON catms.treatment_catalogue IS
    'Refreshes updated_at before a treatment definition changes.';

commit;