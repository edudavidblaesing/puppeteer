-- Migration: Clean venue addresses by removing duplicate city/country information
-- This removes city, country, and postal codes from venue addresses

-- Clean addresses in scraped_events table
UPDATE scraped_events
SET venue_address = (
    SELECT 
        -- Remove semicolon-separated extra parts (keep only first part)
        CASE 
            WHEN venue_address LIKE '%;%' THEN 
                TRIM(SPLIT_PART(venue_address, ';', 1))
            ELSE 
                venue_address
        END
)
WHERE venue_address IS NOT NULL
  AND venue_address LIKE '%;%';

-- Remove city name from addresses in scraped_events
UPDATE scraped_events
SET venue_address = TRIM(
    REGEXP_REPLACE(
        venue_address,
        venue_city || '[,\s]*',
        '',
        'gi'
    )
)
WHERE venue_address IS NOT NULL
  AND venue_city IS NOT NULL
  AND LOWER(venue_address) LIKE '%' || LOWER(venue_city) || '%';

-- Remove country name from addresses in scraped_events
UPDATE scraped_events
SET venue_address = TRIM(
    REGEXP_REPLACE(
        venue_address,
        venue_country || '[,\s]*',
        '',
        'gi'
    )
)
WHERE venue_address IS NOT NULL
  AND venue_country IS NOT NULL
  AND LOWER(venue_address) LIKE '%' || LOWER(venue_country) || '%';

-- Remove 5-digit postal codes from scraped_events addresses
UPDATE scraped_events
SET venue_address = TRIM(
    REGEXP_REPLACE(venue_address, '\y\d{5}\y', '', 'g')
)
WHERE venue_address IS NOT NULL
  AND venue_address ~ '\y\d{5}\y';

-- Clean up extra commas and spaces in scraped_events
UPDATE scraped_events
SET venue_address = TRIM(
    REGEXP_REPLACE(
        REGEXP_REPLACE(venue_address, ',+', ',', 'g'),
        '^,|,$',
        '',
        'g'
    )
)
WHERE venue_address IS NOT NULL;

-- Now do the same for venues table
UPDATE venues
SET address = (
    SELECT 
        CASE 
            WHEN address LIKE '%;%' THEN 
                TRIM(SPLIT_PART(address, ';', 1))
            ELSE 
                address
        END
)
WHERE address IS NOT NULL
  AND address LIKE '%;%';

-- Remove city name from addresses in venues
UPDATE venues
SET address = TRIM(
    REGEXP_REPLACE(
        address,
        city || '[,\s]*',
        '',
        'gi'
    )
)
WHERE address IS NOT NULL
  AND city IS NOT NULL
  AND LOWER(address) LIKE '%' || LOWER(city) || '%';

-- Remove country name from addresses in venues
UPDATE venues
SET address = TRIM(
    REGEXP_REPLACE(
        address,
        country || '[,\s]*',
        '',
        'gi'
    )
)
WHERE address IS NOT NULL
  AND country IS NOT NULL
  AND LOWER(address) LIKE '%' || LOWER(country) || '%';

-- Remove 5-digit postal codes from venues addresses
UPDATE venues
SET address = TRIM(
    REGEXP_REPLACE(address, '\y\d{5}\y', '', 'g')
)
WHERE address IS NOT NULL
  AND address ~ '\y\d{5}\y';

-- Clean up extra commas and spaces in venues
UPDATE venues
SET address = TRIM(
    REGEXP_REPLACE(
        REGEXP_REPLACE(address, ',+', ',', 'g'),
        '^,|,$',
        '',
        'g'
    )
)
WHERE address IS NOT NULL;

-- Also update events table venue_address field
UPDATE events
SET venue_address = (
    SELECT 
        CASE 
            WHEN venue_address LIKE '%;%' THEN 
                TRIM(SPLIT_PART(venue_address, ';', 1))
            ELSE 
                venue_address
        END
)
WHERE venue_address IS NOT NULL
  AND venue_address LIKE '%;%';

UPDATE events
SET venue_address = TRIM(
    REGEXP_REPLACE(
        venue_address,
        venue_city || '[,\s]*',
        '',
        'gi'
    )
)
WHERE venue_address IS NOT NULL
  AND venue_city IS NOT NULL
  AND LOWER(venue_address) LIKE '%' || LOWER(venue_city) || '%';

UPDATE events
SET venue_address = TRIM(
    REGEXP_REPLACE(
        venue_address,
        venue_country || '[,\s]*',
        '',
        'gi'
    )
)
WHERE venue_address IS NOT NULL
  AND venue_country IS NOT NULL
  AND LOWER(venue_address) LIKE '%' || LOWER(venue_country) || '%';

UPDATE events
SET venue_address = TRIM(
    REGEXP_REPLACE(venue_address, '\y\d{5}\y', '', 'g')
)
WHERE venue_address IS NOT NULL
  AND venue_address ~ '\y\d{5}\y';

UPDATE events
SET venue_address = TRIM(
    REGEXP_REPLACE(
        REGEXP_REPLACE(venue_address, ',+', ',', 'g'),
        '^,|,$',
        '',
        'g'
    )
)
WHERE venue_address IS NOT NULL;
