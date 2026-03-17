-- Create storage bucket for property images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-images',
  'property-images',
  true,
  5242880, -- 5 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for property-images bucket
CREATE POLICY "Public read property images"
ON storage.objects FOR SELECT
USING (bucket_id = 'property-images');

CREATE POLICY "Auth users upload property images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'property-images');

CREATE POLICY "Auth users update property images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'property-images');

CREATE POLICY "Auth users delete property images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'property-images');
