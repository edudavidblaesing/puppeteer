#!/bin/bash

API_URL=${API_URL:-"http://localhost:3007"}

echo "🌍 Starting venue geocoding process..."
echo "Using API: $API_URL"
echo ""

# Start geocoding in background
echo "Starting background geocoding for all venues without coordinates..."
curl -X POST "$API_URL/db/venues/geocode-all"   -H 'Content-Type: application/json'   -H 'x-api-key: your-secure-api-key-here'   -d '{"limit": 500, "background": true}' | jq '.'

echo ""
echo "Waiting 5 seconds before checking status..."
sleep 5

# Check status periodically
for i in {1..30}; do
  echo ""
  echo "Status check #$i:"
  STATUS=$(curl -s "$API_URL/db/venues/geocode/status"     -H 'x-api-key: your-secure-api-key-here')
  echo "$STATUS" | jq '.'
  
  # Check if still in progress
  IN_PROGRESS=$(echo "$STATUS" | jq -r '.inProgress')
  
  if [ "$IN_PROGRESS" = "false" ]; then
    echo ""
    echo "✅ Geocoding complete!"
    echo ""
    echo "Failed venues:"
    echo "$STATUS" | jq -r '.stats.failedVenues[]' 2>/dev/null || echo "  None"
    break
  fi
  
  sleep 10
done

echo ""
echo "�� Final stats:"
curl -s "$API_URL/scrape/stats"   -H 'x-api-key: your-secure-api-key-here' | jq '{total_main_venues, total_main_events}'
