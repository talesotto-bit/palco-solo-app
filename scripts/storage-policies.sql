CREATE POLICY auth_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'uploads');
CREATE POLICY public_read_uploads ON storage.objects FOR SELECT TO public USING (bucket_id = 'uploads');
