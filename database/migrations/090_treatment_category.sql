-- owner : dev4
-- Task : CATMS-020
-- Create treatment category table

begin;

create table catms.treatment_category (
    treatment_category_id bigint generated always as identity,
    category_code citext not null,
    name varchar(100) not null,
    description varchar(250),
    is_active boolean not null default true,

    constraint pk_treatment_category primary key (treatment_category_id),
    constraint uq_treatment_category_code unique (category_code),
    constraint uq_treatment_category_name unique (name),
    constraint chk_treatment_category_code_nonempty check (length(trim(category_code)) > 0),
    constraint chk_treatment_category_name_nonempty check (length(trim(name)) > 0)
);

comment on table catms.treatment_category is 'Groups treatments into categories for catalogue organization and reporting.';
comment on column catms.treatment_category.treatment_category_id is 'Unique case insensitive identifier for the treatment category.';
comment on column catms.treatment_category.category_code is 'Unique case insensitive category code.';
comment on column catms.treatment_category.name is 'Unique name of the treatment category.';
comment on column catms.treatment_category.description is 'optional Description of the treatment category.';
comment on column catms.treatment_category.is_active is 'whether the category is active or inactive, preserving existing reference.';

commit;