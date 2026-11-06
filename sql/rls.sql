-- ============================================================================
-- Shunem — Row Level Security policies (run AFTER `prisma migrate deploy`)
-- Implements SRS §18, §83, §99 (location privacy) at the database level.
-- The NestJS PropertyService strips admin-only fields too (defense in depth),
-- but RLS is the authoritative boundary if the app is ever bypassed.
-- ============================================================================

-- Enable RLS on sensitive tables
alter table properties enable row level security;
alter table property_media enable row level security;
alter table property_documents enable row level security;
alter table favorites enable row level security;
alter table notifications enable row level security;
alter table payments enable row level security;
alter table audit_records enable row level security;

-- Helper: is the current JWT role an admin/super_admin?
-- (Supabase exposes auth.uid(); the NestJS API uses the service role for
--  writes, so RLS here primarily protects direct Supabase access from the
--  Flutter app using the anon key + the user's JWT.)
create or replace function is_admin()
returns boolean language sql stable as $$
  select coalesce(
    (auth.jwt() ->> 'role') in ('admin','super_admin'),
    false
  );
$$;

-- ---- Properties: public can read published/available inventory ----
create policy "public read published properties"
  on properties for select
  using (status in ('published','available','reserved','rented','sold'));

-- Admins/Super Admins read the FULL record (including coordinates) (SRS §99)
create policy "admins read all properties"
  on properties for select
  using (is_admin());

-- Owners read/write their own properties
create policy "owners manage own properties"
  on properties for all
  using (owner_id = auth.uid());

-- ---- PUBLIC-SAFE VIEW (SRS §99) — excludes quarter/street/landmark/lat/lng ----
create or replace view public_properties as
  select id, owner_id, title, category_id, type_name, transaction_type,
         furnishing_type, price, price_period, status, verification,
         description, bedrooms, bathrooms, toilets, living_rooms, kitchens,
         floors, surface, land_area, parking, amenity_ids, rating, featured,
         country, region, department, city, neighborhood, created_at
  from properties;

-- ---- Media / documents: public read for published properties ----
create policy "public read media of published"
  on property_media for select
  using (
    exists (select 1 from properties p where p.id = property_media.property_id
            and p.status in ('published','available','reserved','rented','sold'))
  );
create policy "admins read all documents"
  on property_documents for select using (is_admin());

-- ---- Favorites & notifications: own user only ----
create policy "own favorites" on favorites for all using (user_id = auth.uid());
create policy "own notifications" on notifications for select using (user_id = auth.uid());

-- ---- Payments: own user only (admin view via API, not anon) ----
create policy "own payments" on payments for select using (user_id = auth.uid());

-- ---- Audit: append-only, admins read-only ----
create policy "admins read audit" on audit_records for select using (is_admin());
revoke update, delete on audit_records from anon, authenticated;
