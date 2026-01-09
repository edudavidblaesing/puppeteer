-- Migration 021: Seed Resident Advisor Configuration
-- Since explicit ra_area_id columns might be gone, we seed RA configs manually based on known defaults.

DO $$
DECLARE
    ra_source_id INTEGER;
    city_rec RECORD;
BEGIN
    SELECT id INTO ra_source_id FROM event_sources WHERE code = 'ra';

    -- Helper to insert/update RA config
    -- Format: City Name key -> External ID (Area ID)
    
    -- Berlin: 34
    SELECT id INTO city_rec FROM cities WHERE name = 'Berlin';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '34')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '34';
    END IF;

    -- London: 13
    SELECT id INTO city_rec FROM cities WHERE name = 'London';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '13')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '13';
    END IF;

    -- Amsterdam: 29
    SELECT id INTO city_rec FROM cities WHERE name = 'Amsterdam';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '29')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '29';
    END IF;

    -- Paris: 44
    SELECT id INTO city_rec FROM cities WHERE name = 'Paris';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '44')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '44';
    END IF;

    -- Barcelona: 24
    SELECT id INTO city_rec FROM cities WHERE name = 'Barcelona';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '24')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '24';
    END IF;

    -- Ibiza: 195
    SELECT id INTO city_rec FROM cities WHERE name = 'Ibiza';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '195')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '195';
    END IF;

    -- Manchester: 15
    SELECT id INTO city_rec FROM cities WHERE name = 'Manchester';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '15')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '15';
    END IF;

    -- Bristol: 36
    SELECT id INTO city_rec FROM cities WHERE name = 'Bristol';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '36')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '36';
    END IF;

    -- Leeds: 37
    SELECT id INTO city_rec FROM cities WHERE name = 'Leeds';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '37')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '37';
    END IF;

    -- New York: 8
    SELECT id INTO city_rec FROM cities WHERE name = 'New York';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '8')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '8';
    END IF;

    -- Los Angeles: 161
    SELECT id INTO city_rec FROM cities WHERE name = 'Los Angeles';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '161')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '161';
    END IF;

    -- Sydney: 17
    SELECT id INTO city_rec FROM cities WHERE name = 'Sydney';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '17')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '17';
    END IF;

    -- Melbourne: 4
    SELECT id INTO city_rec FROM cities WHERE name = 'Melbourne';
    IF FOUND THEN
        INSERT INTO city_source_configs (city_id, source_id, external_id)
        VALUES (city_rec.id, ra_source_id, '4')
        ON CONFLICT (city_id, source_id) DO UPDATE SET external_id = '4';
    END IF;

END $$;
