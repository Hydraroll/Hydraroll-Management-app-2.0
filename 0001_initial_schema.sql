-- Hydraroll Management App foundation schema. Apply to a Hydraroll-owned project only
-- after security review. Customer data is partitioned by organization membership.
create extension if not exists pgcrypto;

create type public.org_role as enum ('internal_manager','technician','customer_admin','customer_user');
create type public.report_status as enum ('draft','submitted','reviewed','approved','issued');
create type public.document_visibility as enum ('internal','customer_approved');
create type public.stock_movement_type as enum ('receipt','reservation','issue','return','correction');
create type public.defect_status as enum ('new','triaged','assigned','in_progress','awaiting_parts','resolved','closed');
create type public.work_order_status as enum ('draft','scheduled','in_progress','waiting','completed','cancelled');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  abn text,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  platform_role text check (platform_role is null or platform_role = 'platform_admin'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.org_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_memberships_user_idx on public.organization_memberships(user_id, is_active);

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.platform_role='platform_admin') $$;

create or replace function public.is_active_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_platform_admin() or exists(select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id where m.organization_id=p_org and m.user_id=auth.uid() and m.is_active and p.is_active) $$;

create or replace function public.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_platform_admin() or exists(select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id where m.organization_id=p_org and m.user_id=auth.uid() and m.is_active and p.is_active and m.role=any(p_roles)) $$;

create or replace function public.can_read_equipment(p_equipment uuid)
returns boolean language sql stable security definer set search_path = public
as $$
 select public.is_platform_admin() or exists(
   select 1 from public.equipment e
   where e.id=p_equipment and (
     public.has_org_role(e.service_organization_id, array['internal_manager','technician']::public.org_role[])
     or public.is_active_member(e.current_owner_organization_id)
   )
 )
$$;

create table public.organization_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  address text,
  suburb text,
  state text,
  postcode text,
  country text not null default 'Australia',
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null unique,
  serial_number text,
  vin text,
  registration text,
  manufacturer text not null,
  model text not null,
  description text,
  current_owner_organization_id uuid not null references public.organizations(id),
  current_site_id uuid references public.organization_sites(id),
  service_organization_id uuid not null references public.organizations(id),
  parent_equipment_id uuid references public.equipment(id),
  commissioned_on date,
  decommissioned_on date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_equipment_id is null or parent_equipment_id <> id)
);
create index equipment_owner_idx on public.equipment(current_owner_organization_id);
create index equipment_parent_idx on public.equipment(parent_equipment_id);
create unique index equipment_vin_unique on public.equipment(vin) where vin is not null and vin <> '';

create table public.equipment_ownership_history (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id),
  organization_id uuid not null references public.organizations(id),
  site_id uuid references public.organization_sites(id),
  valid_from timestamptz not null,
  valid_to timestamptz,
  recorded_by uuid not null references public.profiles(id),
  note text,
  check (valid_to is null or valid_to >= valid_from)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  part_number text not null,
  description text not null,
  unit text not null default 'each',
  unit_cost numeric(12,2),
  reorder_level numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, part_number),
  check (unit_cost is null or unit_cost >= 0),
  check (reorder_level >= 0)
);

create table public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  site_id uuid references public.organization_sites(id),
  name text not null,
  unique (organization_id, name)
);

create table public.service_reports (
  id uuid primary key default gen_random_uuid(),
  report_number text not null unique,
  equipment_id uuid not null references public.equipment(id),
  performing_organization_id uuid not null references public.organizations(id),
  customer_organization_id uuid not null references public.organizations(id),
  owner_organization_id_at_creation uuid not null references public.organizations(id),
  status public.report_status not null default 'draft',
  customer_visible boolean not null default false,
  version integer not null default 1 check (version > 0),
  supersedes_report_id uuid references public.service_reports(id),
  service_date date not null,
  report_type text not null,
  payload jsonb not null default '{}'::jsonb,
  technician_id uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_reports_equipment_idx on public.service_reports(equipment_id, service_date desc);
create index service_reports_customer_idx on public.service_reports(customer_organization_id, status, service_date desc);

create table public.service_report_lines (
  id uuid primary key default gen_random_uuid(),
  service_report_id uuid not null references public.service_reports(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id),
  line_type text not null default 'part',
  description text not null,
  part_number_snapshot text,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_cost_snapshot numeric(12,2),
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  stock_location_id uuid not null references public.stock_locations(id),
  movement_type public.stock_movement_type not null,
  quantity_delta numeric(12,2) not null check (quantity_delta <> 0),
  idempotency_key text not null unique,
  service_report_line_id uuid references public.service_report_lines(id),
  reverses_movement_id uuid references public.stock_movements(id),
  reason text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((movement_type <> 'correction') or (reverses_movement_id is not null and length(trim(reason)) > 0))
);
create index stock_movements_balance_idx on public.stock_movements(inventory_item_id, stock_location_id, created_at);
create view public.inventory_balances with (security_invoker=true) as
  select organization_id, inventory_item_id, stock_location_id, sum(quantity_delta) as on_hand
  from public.stock_movements group by organization_id, inventory_item_id, stock_location_id;

create table public.technical_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  customer_organization_id uuid references public.organizations(id),
  equipment_id uuid references public.equipment(id),
  service_report_id uuid references public.service_reports(id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0 check (file_size >= 0),
  category text not null default 'other',
  visibility public.document_visibility not null default 'internal',
  approved_at timestamptz,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.defects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  equipment_id uuid not null references public.equipment(id),
  reported_by uuid not null references public.profiles(id),
  safety_severity text not null check (safety_severity in ('low','medium','high','critical')),
  status public.defect_status not null default 'new',
  description text not null,
  assigned_to uuid references public.profiles(id),
  return_to_service_decision text,
  return_to_service_by uuid references public.profiles(id),
  return_to_service_at timestamptz,
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((return_to_service_at is null) = (return_to_service_by is null))
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_organization_id uuid not null references public.organizations(id),
  equipment_id uuid not null references public.equipment(id),
  requested_by uuid not null references public.profiles(id),
  summary text not null,
  details text,
  status text not null default 'new' check (status in ('new','triaged','accepted','declined','converted','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  work_order_number text not null unique,
  performing_organization_id uuid not null references public.organizations(id),
  equipment_id uuid not null references public.equipment(id),
  service_request_id uuid references public.service_requests(id),
  defect_id uuid references public.defects(id),
  status public.work_order_status not null default 'draft',
  assigned_to uuid references public.profiles(id),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  interval_months integer check (interval_months is null or interval_months > 0),
  interval_usage numeric(12,2) check (interval_usage is null or interval_usage > 0),
  usage_unit text,
  customer_visible boolean not null default false,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (interval_months is not null or interval_usage is not null)
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  organization_id uuid references public.organizations(id),
  notification_type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Report visibility remains tied to the customer organization that commissioned the work,
-- even when equipment ownership later changes.
create or replace function public.can_read_service_report(p_report uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_platform_admin() or exists(
  select 1 from public.service_reports r where r.id=p_report and (
    public.has_org_role(r.performing_organization_id, array['internal_manager','technician']::public.org_role[])
    or (r.customer_visible and r.status in ('approved','issued') and public.is_active_member(r.customer_organization_id))
  )
) $$;

create or replace function public.can_read_document(p_document uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_platform_admin() or exists(
  select 1 from public.technical_documents d where d.id=p_document and (
    public.has_org_role(d.organization_id, array['internal_manager','technician']::public.org_role[])
    or (d.visibility='customer_approved' and d.approved_at is not null and public.is_active_member(d.customer_organization_id))
  )
) $$;

-- Restrict security-definer helper execution to signed-in application users.
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.is_active_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, public.org_role[]) from public, anon;
revoke all on function public.can_read_equipment(uuid) from public, anon;
revoke all on function public.can_read_service_report(uuid) from public, anon;
revoke all on function public.can_read_document(uuid) from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;
grant execute on function public.can_read_equipment(uuid) to authenticated;
grant execute on function public.can_read_service_report(uuid) to authenticated;
grant execute on function public.can_read_document(uuid) to authenticated;

-- RLS is enabled on every exposed business table. Missing policies mean deny.
do $$ declare t text; begin
  foreach t in array array['organizations','profiles','organization_memberships','organization_sites','equipment','equipment_ownership_history','inventory_items','stock_locations','service_reports','service_report_lines','stock_movements','technical_documents','defects','service_requests','work_orders','maintenance_plans','activity_events','notifications'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy organizations_read_member on public.organizations for select to authenticated using (public.is_platform_admin() or public.is_active_member(id));
create policy organizations_admin_write on public.organizations for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy profiles_read_self_admin_or_org_admin on public.profiles for select to authenticated using (
  id=auth.uid() or public.is_platform_admin() or exists(select 1 from public.organization_memberships mine join public.organization_memberships theirs using(organization_id) where mine.user_id=auth.uid() and mine.is_active and mine.role in ('internal_manager','customer_admin') and theirs.user_id=id and theirs.is_active)
);
create policy profiles_update_self on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy memberships_read_self_or_admin on public.organization_memberships for select to authenticated using (user_id=auth.uid() or public.is_platform_admin() or public.has_org_role(organization_id,array['internal_manager','customer_admin']::public.org_role[]));
create policy memberships_platform_admin_manage on public.organization_memberships for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
-- Membership changes are platform-admin-only until a verified invitation workflow exists.

create policy sites_read_member on public.organization_sites for select to authenticated using (public.is_active_member(organization_id));
create policy sites_manage_internal on public.organization_sites for all to authenticated using (public.has_org_role(organization_id,array['internal_manager']::public.org_role[])) with check (public.has_org_role(organization_id,array['internal_manager']::public.org_role[]));
create policy equipment_read_related_org on public.equipment for select to authenticated using (public.can_read_equipment(id));
create policy equipment_manage_internal on public.equipment for all to authenticated using (public.has_org_role(service_organization_id,array['internal_manager','technician']::public.org_role[])) with check (public.has_org_role(service_organization_id,array['internal_manager','technician']::public.org_role[]));
create policy ownership_history_internal on public.equipment_ownership_history for select to authenticated using (public.has_org_role((select service_organization_id from public.equipment where id=equipment_id),array['internal_manager','technician']::public.org_role[]));
create policy ownership_history_manage_internal on public.equipment_ownership_history for all to authenticated using (public.has_org_role((select service_organization_id from public.equipment where id=equipment_id),array['internal_manager']::public.org_role[])) with check (public.has_org_role((select service_organization_id from public.equipment where id=equipment_id),array['internal_manager']::public.org_role[]));

create policy inventory_read_internal on public.inventory_items for select to authenticated using (public.has_org_role(organization_id,array['internal_manager','technician']::public.org_role[]));
create policy inventory_manage_internal on public.inventory_items for all to authenticated using (public.has_org_role(organization_id,array['internal_manager']::public.org_role[])) with check (public.has_org_role(organization_id,array['internal_manager']::public.org_role[]));
create policy stock_locations_internal on public.stock_locations for select to authenticated using (public.has_org_role(organization_id,array['internal_manager','technician']::public.org_role[]));
create policy stock_locations_manage on public.stock_locations for all to authenticated using (public.has_org_role(organization_id,array['internal_manager']::public.org_role[])) with check (public.has_org_role(organization_id,array['internal_manager']::public.org_role[]));
create policy reports_read_by_visibility on public.service_reports for select to authenticated using (public.can_read_service_report(id));
create policy reports_create_internal on public.service_reports for insert to authenticated with check (public.has_org_role(performing_organization_id,array['internal_manager','technician']::public.org_role[]) and technician_id=auth.uid());
create policy reports_edit_internal_draft on public.service_reports for update to authenticated using (
  status in ('draft','submitted') and (
    public.has_org_role(performing_organization_id,array['internal_manager']::public.org_role[])
    or (technician_id=auth.uid() and public.has_org_role(performing_organization_id,array['technician']::public.org_role[]))
  )
) with check (status in ('draft','submitted') and (
  public.has_org_role(performing_organization_id,array['internal_manager']::public.org_role[])
  or (technician_id=auth.uid() and public.has_org_role(performing_organization_id,array['technician']::public.org_role[]))
));
create policy report_lines_read_by_parent on public.service_report_lines for select to authenticated using (public.can_read_service_report(service_report_id));
create policy report_lines_edit_internal_draft on public.service_report_lines for all to authenticated using (exists(select 1 from public.service_reports r where r.id=service_report_id and r.status in ('draft','submitted') and public.has_org_role(r.performing_organization_id,array['internal_manager','technician']::public.org_role[]))) with check (exists(select 1 from public.service_reports r where r.id=service_report_id and r.status in ('draft','submitted') and public.has_org_role(r.performing_organization_id,array['internal_manager','technician']::public.org_role[])));
create policy stock_movements_internal_read on public.stock_movements for select to authenticated using (public.has_org_role(organization_id,array['internal_manager','technician']::public.org_role[]));
-- Movement writes are intentionally reserved for audited, idempotent database functions.

create policy documents_read_by_visibility on public.technical_documents for select to authenticated using (
  public.has_org_role(organization_id,array['internal_manager','technician']::public.org_role[])
  or uploaded_by=auth.uid()
  or (visibility='customer_approved' and approved_at is not null and public.is_active_member(customer_organization_id))
);
create policy documents_upload_member on public.technical_documents for insert to authenticated with check (public.is_active_member(organization_id) and uploaded_by=auth.uid() and visibility='internal' and approved_at is null);
create policy documents_manage_internal on public.technical_documents for update to authenticated using (public.has_org_role(organization_id,array['internal_manager']::public.org_role[])) with check (public.has_org_role(organization_id,array['internal_manager']::public.org_role[]));
create policy documents_delete_uploader_or_manager on public.technical_documents for delete to authenticated using (uploaded_by=auth.uid() or public.has_org_role(organization_id,array['internal_manager']::public.org_role[]));

create policy defects_read_related_org on public.defects for select to authenticated using (
  public.has_org_role((select service_organization_id from public.equipment where id=equipment_id),array['internal_manager','technician']::public.org_role[])
  or (reported_by=auth.uid() and public.is_active_member(organization_id))
);
create policy defects_create_customer_or_internal on public.defects for insert to authenticated with check (reported_by=auth.uid() and public.is_active_member(organization_id) and public.can_read_equipment(equipment_id));
create policy defects_update_internal on public.defects for update to authenticated using (public.has_org_role((select service_organization_id from public.equipment where id=equipment_id),array['internal_manager','technician']::public.org_role[])) with check (public.has_org_role((select service_organization_id from public.equipment where id=equipment_id),array['internal_manager','technician']::public.org_role[]));
create policy service_requests_read_org on public.service_requests for select to authenticated using (public.is_active_member(customer_organization_id) or public.has_org_role((select service_organization_id from public.equipment where id=equipment_id),array['internal_manager','technician']::public.org_role[]));
create policy service_requests_create_customer on public.service_requests for insert to authenticated with check (requested_by=auth.uid() and public.has_org_role(customer_organization_id,array['customer_admin','customer_user']::public.org_role[]) and public.can_read_equipment(equipment_id));
create policy service_requests_update_internal on public.service_requests for update to authenticated using (public.has_org_role((select service_organization_id from public.equipment where id=equipment_id),array['internal_manager','technician']::public.org_role[])) with check (public.has_org_role((select service_organization_id from public.equipment where id=equipment_id),array['internal_manager','technician']::public.org_role[]));
create policy work_orders_internal on public.work_orders for select to authenticated using (public.has_org_role(performing_organization_id,array['internal_manager','technician']::public.org_role[]));
create policy work_orders_manage_internal on public.work_orders for all to authenticated using (public.has_org_role(performing_organization_id,array['internal_manager']::public.org_role[])) with check (public.has_org_role(performing_organization_id,array['internal_manager']::public.org_role[]));
create policy plans_read_internal_or_customer on public.maintenance_plans for select to authenticated using (public.has_org_role(organization_id,array['internal_manager','technician']::public.org_role[]) or (customer_visible and public.is_active_member(organization_id)));
create policy plans_manage_internal on public.maintenance_plans for all to authenticated using (public.has_org_role(organization_id,array['internal_manager']::public.org_role[])) with check (public.has_org_role(organization_id,array['internal_manager']::public.org_role[]));
create policy activity_read_internal on public.activity_events for select to authenticated using (public.has_org_role(organization_id,array['internal_manager','technician']::public.org_role[]));
create policy notifications_read_recipient on public.notifications for select to authenticated using (recipient_id=auth.uid() and (organization_id is null or public.is_active_member(organization_id)));
create policy notifications_update_recipient on public.notifications for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());

-- Explicit grants complement RLS. In particular, profiles cannot self-assign platform roles.
revoke all on all tables in schema public from anon, authenticated;
grant select,insert,update,delete on public.organizations, public.organization_memberships, public.organization_sites, public.equipment, public.equipment_ownership_history, public.inventory_items, public.stock_locations, public.service_report_lines, public.technical_documents, public.defects, public.service_requests, public.work_orders, public.maintenance_plans to authenticated;
grant select,update on public.profiles to authenticated;
grant select,insert,update on public.service_reports to authenticated;
grant select on public.stock_movements, public.activity_events to authenticated;
grant select,update on public.notifications to authenticated;
grant select on public.inventory_balances to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke all on all tables in schema public from anon;

insert into storage.buckets (id,name,public,file_size_limit)
values ('hydraroll-documents','hydraroll-documents',false,52428800)
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit;

create policy private_documents_select on storage.objects for select to authenticated using (
  bucket_id='hydraroll-documents' and exists(select 1 from public.technical_documents d where d.storage_path=name and public.can_read_document(d.id))
);
create policy private_documents_insert on storage.objects for insert to authenticated with check (
  bucket_id='hydraroll-documents' and public.is_active_member((storage.foldername(name))[1]::uuid) and (storage.foldername(name))[2]=auth.uid()::text
);
create policy private_documents_delete on storage.objects for delete to authenticated using (
  bucket_id='hydraroll-documents' and exists(select 1 from public.technical_documents d where d.storage_path=name and (d.uploaded_by=auth.uid() or public.has_org_role(d.organization_id,array['internal_manager']::public.org_role[])))
);

-- Status changes and approvals are completed through audited workflow functions in a later milestone.
-- The status enum and RLS currently prevent customer users from changing reports.
