#!/bin/bash

echo "🌍 Starting event geocoding process..."
echo ""

# Start geocoding in background
echo "Starting background geocoding for all events without coordinates..."
curl -X POST 'https://pptr.davidblaesing.com/db/events/geocode' \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: your-secure-api-key-here' \
  -d '{"limit": 500, "background": true}' | jq '.'

echo ""
echo "Waiting 5 seconds before checking status..."
sleep 5

# Check status periodically
for i in {1..20}; do
  echo ""
  echo "Status check #$i:"
  curl -s 'https://pptr.davidblaesing.com/db/events/geocode/status' \
    -H 'x-api-key: your-secure-api-key-here' | jq '.'
  
  # Check if still in progress
  IN_PROGRESS=$(curl -s 'https://pptr.davidblaesing.com/db/events/geocode/status' \
    -H 'x-api-key: your-secure-api-key-here' | jq -r '.inProgress')
  
  if [ "$IN_PROGRESS" = "false" ]; then
    echo ""
    echo "✅ Geocoding complete!"
    break
  fi
  
  sleep 10
done

echo ""
echo "📊 Final check of events stats:"
curl -s 'https://pptr.davidblaesing.com/scrape/stats' \
  -H 'x-api-key: your-secure-api-key-here' | jq '{total_main_events, pending_events, approved_events}'
