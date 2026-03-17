DO $$
DECLARE
  v_owner_id uuid;
  v_property_id uuid;
  v_room_id uuid;
BEGIN
  SELECT id
  INTO v_owner_id
  FROM public.owners
  WHERE email = 'owner@gharpayy.com'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Demo owner account must exist before seeding demo property';
  END IF;

  SELECT id
  INTO v_property_id
  FROM public.properties
  WHERE name = 'Demo Owner Test Residency'
  LIMIT 1;

  IF v_property_id IS NULL THEN
    INSERT INTO public.properties (
      name,
      address,
      city,
      area,
      price_range,
      is_active,
      owner_id,
      property_manager,
      total_rooms,
      total_beds,
      amenities,
      gender_allowed,
      google_maps_link,
      photos,
      virtual_tour_link,
      latitude,
      longitude,
      description,
      rating,
      total_reviews,
      is_verified
    )
    VALUES (
      'Demo Owner Test Residency',
      '12 Demo Lane, Marathahalli',
      'Bangalore',
      'Marathahalli',
      '9000-12000',
      true,
      v_owner_id,
      'Demo Owner',
      1,
      1,
      ARRAY['WiFi', 'Food', 'Laundry', 'Security', 'Cleaning'],
      'any',
      'https://maps.google.com/?q=12.9591,77.6974',
      ARRAY[
        'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80'
      ],
      'https://meet.google.com/demo-owner-tour',
      12.9591,
      77.6974,
      'A verified demo property seeded for booking and payment integration testing.',
      4.8,
      12,
      true
    )
    RETURNING id INTO v_property_id;
  ELSE
    UPDATE public.properties
    SET owner_id = v_owner_id,
        is_active = true,
        is_verified = true,
        total_rooms = 1,
        total_beds = 1,
        amenities = ARRAY['WiFi', 'Food', 'Laundry', 'Security', 'Cleaning'],
        gender_allowed = 'any',
        property_manager = 'Demo Owner',
        latitude = 12.9591,
        longitude = 77.6974,
        description = 'A verified demo property seeded for booking and payment integration testing.',
        photos = ARRAY[
          'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80'
        ],
        virtual_tour_link = 'https://meet.google.com/demo-owner-tour'
    WHERE id = v_property_id;
  END IF;

  SELECT id
  INTO v_room_id
  FROM public.rooms
  WHERE property_id = v_property_id
    AND room_number = '101'
  LIMIT 1;

  IF v_room_id IS NULL THEN
    INSERT INTO public.rooms (
      property_id,
      room_number,
      floor,
      bed_count,
      status,
      actual_rent,
      expected_rent,
      min_acceptable_rent,
      amenities,
      room_type,
      last_confirmed_at,
      auto_locked,
      notes,
      room_code,
      bathroom_type,
      furnishing,
      rent_per_bed
    )
    VALUES (
      v_property_id,
      '101',
      '1',
      1,
      'vacant',
      10500,
      10500,
      9500,
      ARRAY['Wardrobe', 'Study Table', 'Attached Bathroom'],
      'private',
      now(),
      false,
      'Demo room for reservation and payment testing',
      'DTR-101',
      'Attached',
      'Fully Furnished',
      10500
    )
    RETURNING id INTO v_room_id;
  ELSE
    UPDATE public.rooms
    SET status = 'vacant',
        bed_count = 1,
        actual_rent = 10500,
        expected_rent = 10500,
        min_acceptable_rent = 9500,
        amenities = ARRAY['Wardrobe', 'Study Table', 'Attached Bathroom'],
        room_type = 'private',
        last_confirmed_at = now(),
        auto_locked = false,
        notes = 'Demo room for reservation and payment testing',
        room_code = 'DTR-101',
        bathroom_type = 'Attached',
        furnishing = 'Fully Furnished',
        rent_per_bed = 10500
    WHERE id = v_room_id;
  END IF;

  INSERT INTO public.beds (
    room_id,
    bed_number,
    status,
    current_rent,
    notes
  )
  VALUES (
    v_room_id,
    'B1',
    'vacant',
    10500,
    'Demo bed for pre-booking and payment integration'
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.beds
  SET status = 'vacant',
      current_rent = 10500,
      current_tenant_name = NULL,
      move_in_date = NULL,
      move_out_date = NULL,
      notes = 'Demo bed for pre-booking and payment integration'
  WHERE room_id = v_room_id
    AND bed_number = 'B1';
END $$;
