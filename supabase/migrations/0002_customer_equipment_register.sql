-- Customer and equipment register additions. Apply only after the foundation
-- migration has been reviewed in a non-production Supabase project.
begin;

alter table public.organizations
  add column if not exists customer_reference text,
  add column if not exists notes text,
  add column if not exists is_active boolean not null default true;
create unique index if not exists organizations_customer_reference_unique
  on public.organizations(lower(customer_reference)) where customer_reference is not null and customer_reference <> '';

alter table public.organization_sites
  add column if not exists site_type text not null default 'operating'
    check (site_type in ('billing','operating','both','other')),
  add column if not exists is_active boolean not null default true,
  add column if not exists notes text;

create table if not exists public.organization_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  job_title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists organization_contacts_org_idx on public.organization_contacts(organization_id,is_active);
create unique index if not exists organization_contacts_one_primary
  on public.organization_contacts(organization_id) where is_primary and is_active;

create table if not exists public.equipment_manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.equipment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.equipment_manufacturers(name,sort_order) values
  ('Goldhofer',10),('SCHEUERLE',20),('FAYMONVILLE',30),('KAMAG',40),('Enerpac',50),('Other',99)
on conflict(name) do nothing;
insert into public.equipment_categories(name,sort_order) values
  ('Trailer',10),('Gooseneck',20),('Power pack',30),('Axle line',40),('Module',50),('Other',99)
on conflict(name) do nothing;

alter table public.equipment
  add column if not exists manufacturer_id uuid references public.equipment_manufacturers(id),
  add column if not exists category_id uuid references public.equipment_categories(id),
  add column if not exists customer_asset_number text,
  add column if not exists manufacture_year integer check (manufacture_year is null or manufacture_year between 1900 and 2200),
  add column if not exists configuration text,
  add column if not exists axle_line_count integer check (axle_line_count is null or axle_line_count >= 0),
  add column if not exists operational_status text not null default 'active'
    check (operational_status in ('active','out_of_service','under_repair','decommissioned')),
  add column if not exists technical_notes text,
  add column if not exists registered_at date not null default current_date;
create index if not exists equipment_owner_site_idx on public.equipment(current_owner_organization_id,current_site_id);
create index if not exists equipment_manufacturer_serial_idx on public.equipment(lower(serial_number)) where serial_number is not null and serial_number <> '';
create unique index if not exists organization_sites_org_id_pair on public.organization_sites(organization_id,id);
create unique index if not exists equipment_owner_id_pair on public.equipment(current_owner_organization_id,id);
alter table public.equipment drop constraint if exists equipment_site_same_owner_fk;
alter table public.equipment add constraint equipment_site_same_owner_fk
  foreign key(current_owner_organization_id,current_site_id)
  references public.organization_sites(organization_id,id) not valid;
alter table public.equipment drop constraint if exists equipment_parent_same_owner_fk;
alter table public.equipment add constraint equipment_parent_same_owner_fk
  foreign key(current_owner_organization_id,parent_equipment_id)
  references public.equipment(current_owner_organization_id,id) not valid;

-- IDs remain stable for the lifetime of an asset and can safely identify a QR
-- destination. The destination still requires sign-in and passes the same RLS.
comment on column public.equipment.asset_id is 'Permanent human-readable Hydraroll equipment ID; QR is navigation only and grants no access.';

create or replace function public.prevent_equipment_asset_id_change()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.asset_id is distinct from old.asset_id then
    raise exception 'equipment asset_id is permanent and cannot be changed';
  end if;
  return new;
end
$$;
drop trigger if exists equipment_asset_id_immutable on public.equipment;
create trigger equipment_asset_id_immutable before update of asset_id on public.equipment
  for each row execute function public.prevent_equipment_asset_id_change();

create or replace function public.is_internal_staff(p_roles public.org_role[] default array['internal_manager','technician']::public.org_role[])
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id=m.organization_id
    join public.profiles p on p.id=m.user_id
    where m.user_id=auth.uid() and m.is_active and p.is_active and o.is_internal and m.role=any(p_roles)
  )
$$;

alter table public.organization_contacts enable row level security;
alter table public.equipment_manufacturers enable row level security;
alter table public.equipment_categories enable row level security;

create policy organizations_internal_read_register on public.organizations for select to authenticated
  using (public.is_internal_staff());
create policy organizations_internal_manage_register on public.organizations for update to authenticated
  using (public.is_internal_staff(array['internal_manager']::public.org_role[]))
  with check (public.is_internal_staff(array['internal_manager']::public.org_role[]));

create policy sites_internal_read_register on public.organization_sites for select to authenticated
  using (public.is_internal_staff() or public.is_active_member(organization_id));
create policy sites_manage_register on public.organization_sites for all to authenticated
  using (public.is_internal_staff(array['internal_manager']::public.org_role[]) or public.has_org_role(organization_id,array['customer_admin']::public.org_role[]))
  with check (public.is_internal_staff(array['internal_manager']::public.org_role[]) or public.has_org_role(organization_id,array['customer_admin']::public.org_role[]));

create policy contacts_read_register on public.organization_contacts for select to authenticated
  using (public.is_internal_staff() or public.is_active_member(organization_id));
create policy contacts_manage_register on public.organization_contacts for all to authenticated
  using (public.is_internal_staff(array['internal_manager']::public.org_role[]) or public.has_org_role(organization_id,array['customer_admin']::public.org_role[]))
  with check (public.is_internal_staff(array['internal_manager']::public.org_role[]) or public.has_org_role(organization_id,array['customer_admin']::public.org_role[]));

create policy equipment_read_customer_or_staff on public.equipment for select to authenticated
  using (public.is_internal_staff() or public.is_active_member(current_owner_organization_id));
-- Replace the foundation policy: technicians can service assets but cannot
-- create/delete or change the customer equipment register itself.
drop policy if exists equipment_manage_internal on public.equipment;
create policy equipment_manage_internal_register on public.equipment for insert to authenticated
  with check (public.is_internal_staff(array['internal_manager']::public.org_role[]));
create policy equipment_update_internal_register on public.equipment for update to authenticated
  using (public.is_internal_staff(array['internal_manager']::public.org_role[]))
  with check (public.is_internal_staff(array['internal_manager']::public.org_role[]));

create policy manufacturers_read_authenticated on public.equipment_manufacturers for select to authenticated using (true);
create policy manufacturers_manage_internal on public.equipment_manufacturers for all to authenticated
  using (public.is_internal_staff(array['internal_manager']::public.org_role[]))
  with check (public.is_internal_staff(array['internal_manager']::public.org_role[]));
create policy categories_read_authenticated on public.equipment_categories for select to authenticated using (true);
create policy categories_manage_internal on public.equipment_categories for all to authenticated
  using (public.is_internal_staff(array['internal_manager']::public.org_role[]))
  with check (public.is_internal_staff(array['internal_manager']::public.org_role[]));

grant select on public.equipment_manufacturers,public.equipment_categories to authenticated;
grant insert,update,delete on public.equipment_manufacturers,public.equipment_categories to authenticated;
grant select,insert,update,delete on public.organization_contacts to authenticated;
grant update on public.organizations to authenticated;
grant select,insert,update on public.organization_sites to authenticated;
grant select,insert,update on public.equipment to authenticated;
revoke delete on public.equipment from authenticated;

commit;
