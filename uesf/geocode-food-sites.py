#!/usr/bin/env python3
"""
One-time script to geocode ~40 SFUSD strike food distribution sites.
Uses Mapbox Geocoding API. Outputs food-sites.js with lat/lng coordinates.
"""

import json
import time
import urllib.request
import urllib.parse
import sys

MAPBOX_TOKEN = 'pk.eyJ1IjoidHdvZiIsImEiOiJjbWt6eXdzZWIwN2toM2dvaG56N2xldXBnIn0.UNp3hM0WgWhlNTCQL6zTdQ'

# All 40 food distribution sites with their meal offerings
SITES = [
    {
        "name": "826 Valencia - Main",
        "address": "826 Valencia Street, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 30}}
    },
    {
        "name": "826 Valencia - Mission Bay",
        "address": "1310 4th Street, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 30}}
    },
    {
        "name": "826 Valencia - Tenderloin",
        "address": "180 Golden Gate Avenue, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 30}}
    },
    {
        "name": "Bayview YMCA",
        "address": "1601 Lane Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 50},
            "breakfast_feb10": {"capacity": 50},
            "lunch_feb10": {"capacity": 50}
        }
    },
    {
        "name": "Bernal Heights Library",
        "address": "500 Cortland Avenue, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 20}}
    },
    {
        "name": "Betty Ann Ong Recreation Center",
        "address": "1199 Mason Street, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 30}}
    },
    {
        "name": "Boys and Girls Clubs - Excelsior",
        "address": "163 London Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 30},
            "lunch_feb10": {"capacity": 30}
        }
    },
    {
        "name": "Buena Vista Child Care",
        "address": "1249 Alabama Street, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 40}}
    },
    {
        "name": "Community Youth Center - Chinatown",
        "address": "830 Sacramento Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 100},
            "lunch_feb10": {"capacity": 100}
        }
    },
    {
        "name": "Community Youth Center - Richmond",
        "address": "980 Clement Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 150},
            "lunch_feb10": {"capacity": 100}
        }
    },
    {
        "name": "Community Youth Center - Tenderloin",
        "address": "1038 Post Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 50},
            "lunch_feb10": {"capacity": 50}
        }
    },
    {
        "name": "FACES SF",
        "address": "100 Whitney Young Circle, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 100},
            "lunch_feb10": {"capacity": 100}
        }
    },
    {
        "name": "Gilman Playground",
        "address": "903 Gilman Avenue, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 45},
            "breakfast_feb10": {"capacity": 45},
            "lunch_feb10": {"capacity": 45}
        }
    },
    {
        "name": "Hamilton Recreation Center",
        "address": "1900 Geary Boulevard, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 20},
            "breakfast_feb10": {"capacity": 20},
            "lunch_feb10": {"capacity": 20}
        }
    },
    {
        "name": "Ingleside Library",
        "address": "1298 Ocean Avenue, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 20}}
    },
    {
        "name": "Joseph Lee Recreation Center",
        "address": "1395 Mendell Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 40},
            "breakfast_feb10": {"capacity": 40},
            "lunch_feb10": {"capacity": 40}
        }
    },
    {
        "name": "Main Library",
        "address": "100 Larkin Street, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 20}}
    },
    {
        "name": "Minnie and Lovie Ward Recreation Center",
        "address": "650 Capitol Avenue, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 30}}
    },
    {
        "name": "Mission Graduates",
        "address": "3040 16th Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 100},
            "breakfast_feb10": {"capacity": 100},
            "lunch_feb10": {"capacity": 100}
        }
    },
    {
        "name": "Mission Language and Vocational School - Excelsior",
        "address": "4834 Mission Street, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 100}}
    },
    {
        "name": "Mission Language and Vocational School - Main",
        "address": "2929 19th Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 150},
            "breakfast_feb10": {"capacity": 100},
            "lunch_feb10": {"capacity": 150}
        }
    },
    {
        "name": "Palega Recreation Center",
        "address": "500 Felton Street, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 30}}
    },
    {
        "name": "Pomeroy Recreation & Rehabilitation Center",
        "address": "207 Skyline Boulevard, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 20},
            "breakfast_feb10": {"capacity": 20},
            "lunch_feb10": {"capacity": 50}
        }
    },
    {
        "name": "Potrero Library",
        "address": "1616 20th Street, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 20}}
    },
    {
        "name": "Portola Library",
        "address": "380 Bacon Street, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 40}}
    },
    {
        "name": "R.O.C.K",
        "address": "1533 Sunnydale Avenue, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 40},
            "breakfast_feb10": {"capacity": 40},
            "lunch_feb10": {"capacity": 30}
        }
    },
    {
        "name": "Samoan Community Development Center",
        "address": "2055 Sunnydale Avenue, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 30},
            "breakfast_feb10": {"capacity": 30},
            "lunch_feb10": {"capacity": 30}
        }
    },
    {
        "name": "St. Mary's Recreation Center",
        "address": "95 Justin Drive, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 30}}
    },
    {
        "name": "Sunset Recreation Center",
        "address": "2201 Lawton Street, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 30}}
    },
    {
        "name": "TEL HI Neighborhood Center - Site 1",
        "address": "555 Chestnut Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 90},
            "breakfast_feb10": {"capacity": 90},
            "lunch_feb10": {"capacity": 90}
        }
    },
    {
        "name": "TEL HI Neighborhood Center - Site 2",
        "address": "567 Bay Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 50},
            "breakfast_feb10": {"capacity": 50},
            "lunch_feb10": {"capacity": 50}
        }
    },
    {
        "name": "TEL HI Neighborhood Center - Site 3",
        "address": "660 Lombard Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 75},
            "lunch_feb10": {"capacity": 75}
        }
    },
    {
        "name": "The Marsh",
        "address": "1070 Valencia Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 80},
            "breakfast_feb10": {"capacity": 80},
            "lunch_feb10": {"capacity": 80}
        }
    },
    {
        "name": "The Richmond Neighborhood Center",
        "address": "741 30th Avenue, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 150},
            "lunch_feb10": {"capacity": 150}
        }
    },
    {
        "name": "UP ON TOP",
        "address": "570 Ellis Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 75},
            "breakfast_feb10": {"capacity": 50},
            "lunch_feb10": {"capacity": 75}
        }
    },
    {
        "name": "Vision Academy - Bayview",
        "address": "1311 Quesada Avenue, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 60}}
    },
    {
        "name": "Visitacion Valley Library",
        "address": "201 Leland Avenue, San Francisco, CA",
        "meals": {"lunch_feb10": {"capacity": 30}}
    },
    {
        "name": "Youth 1st",
        "address": "801 Shields Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 50},
            "breakfast_feb10": {"capacity": 50},
            "lunch_feb10": {"capacity": 50}
        }
    },
    {
        "name": "Youth Art Exchange - Site 1",
        "address": "1950 Mission Street, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 50},
            "lunch_feb10": {"capacity": 35}
        }
    },
    {
        "name": "Youth Art Exchange - Site 2",
        "address": "400 Geneva Avenue, San Francisco, CA",
        "meals": {
            "lunch_feb9": {"capacity": 50},
            "lunch_feb10": {"capacity": 30}
        }
    },
]


def geocode(address):
    """Geocode an address using Mapbox Geocoding API."""
    encoded = urllib.parse.quote(address)
    url = (
        f"https://api.mapbox.com/geocoding/v5/mapbox.places/{encoded}.json"
        f"?access_token={MAPBOX_TOKEN}"
        f"&limit=1"
        f"&types=address,poi"
        f"&bbox=-122.52,-37.70,-122.35,37.82"
    )
    with urllib.request.urlopen(url) as resp:
        data = json.loads(resp.read().decode())

    if not data.get("features"):
        return None, None

    lng, lat = data["features"][0]["center"]
    return lat, lng


def main():
    results = []
    errors = []

    for i, site in enumerate(SITES):
        name = site["name"]
        address = site["address"]
        print(f"[{i+1}/{len(SITES)}] Geocoding: {name} ({address})...", end=" ")

        try:
            lat, lng = geocode(address)
            if lat is None:
                print("NOT FOUND")
                errors.append(name)
                continue

            print(f"OK ({lat:.6f}, {lng:.6f})")
            results.append({
                "name": name,
                "address": address.replace(", San Francisco, CA", ""),
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "meals": site["meals"]
            })
        except Exception as e:
            print(f"ERROR: {e}")
            errors.append(name)

        # Rate limit: ~10 requests/sec is fine for Mapbox
        time.sleep(0.15)

    # Write output
    js_lines = ["var FOOD_SITES = ["]
    for j, r in enumerate(results):
        meals_str = json.dumps(r["meals"])
        # Clean address for display
        addr = r["address"]
        comma = "," if j < len(results) - 1 else ""
        js_lines.append(
            f'  {{ name: {json.dumps(r["name"])}, '
            f'address: {json.dumps(addr)}, '
            f'lat: {r["lat"]}, lng: {r["lng"]}, '
            f'meals: {meals_str} }}{comma}'
        )
    js_lines.append("];")

    output = "\n".join(js_lines) + "\n"

    with open("food-sites.js", "w") as f:
        f.write(output)

    print(f"\nDone! Wrote {len(results)} sites to food-sites.js")
    if errors:
        print(f"Failed to geocode: {', '.join(errors)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
