DELETE FROM public.beds b
WHERE EXISTS (
  SELECT 1
  FROM public.rooms r
  JOIN public.properties p ON p.id = r.property_id
  WHERE p.name = 'Demo Owner Test Residency'
    AND r.id = b.room_id
    AND EXISTS (
      SELECT 1
      FROM public.beds newer
      WHERE newer.room_id = b.room_id
        AND newer.bed_number = b.bed_number
        AND (
          newer.created_at > b.created_at
          OR (newer.created_at = b.created_at AND newer.id > b.id)
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS beds_room_id_bed_number_unique
ON public.beds(room_id, bed_number);
