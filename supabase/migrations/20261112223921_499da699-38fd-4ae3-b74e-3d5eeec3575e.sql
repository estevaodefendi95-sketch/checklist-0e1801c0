ALTER FUNCTION checklist.pode_acessar_area(uuid) SET search_path = '';
ALTER FUNCTION checklist.auth_role() SET search_path = '';
ALTER FUNCTION checklist.auth_areas_permitidas() SET search_path = '';
ALTER FUNCTION checklist.handle_new_user() SET search_path = '';

DROP POLICY IF EXISTS "authenticated users read role permissions" ON public.role_page_permissions;
CREATE POLICY "authenticated users read role permissions" ON public.role_page_permissions
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete logos" ON storage.objects;
CREATE POLICY "Admins can upload logos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'master')));
CREATE POLICY "Admins can update logos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'master')));
CREATE POLICY "Admins can delete logos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'logos' AND (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'master')));