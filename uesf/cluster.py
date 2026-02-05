#!/usr/bin/env python3
"""Find top non-overlapping 5-school clusters by SED need and route compactness.

Usage: python3 cluster.py [--min-enrollment N] [--top N] [--max-dist KM] [--weight N]

Scoring: avg_sed - weight * route_km
  Higher weight = prefer tighter clusters over higher SED.
"""
import re, itertools, math, json, argparse, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--min-enrollment', type=int, default=100,
                        help='Exclude schools with fewer than N students (default: 100)')
    parser.add_argument('--top', type=int, default=10,
                        help='Number of top clusters to return (default: 10)')
    parser.add_argument('--max-dist', type=float, default=2.0,
                        help='Max neighbor distance in km (default: 2.0)')
    parser.add_argument('--weight', type=float, default=2.0,
                        help='Route penalty: avg_sed - weight*route_km (default: 2.0)')
    parser.add_argument('--min-sed', type=float, default=50.0,
                        help='Skip clusters with avg SED below this (default: 50)')
    parser.add_argument('--json', action='store_true',
                        help='Output JSON only')
    args = parser.parse_args()

    with open(os.path.join(SCRIPT_DIR, 'sfusd-schools.js'), 'r') as f:
        content = f.read()

    schools = []
    pattern = (r'\{\s*name:\s*"([^"]+)",\s*address:\s*"([^"]+)",'
               r'\s*lat:\s*([\d.]+),\s*lng:\s*(-?[\d.]+),'
               r'\s*sedPct:\s*([\d.]+|null),\s*enrollment:\s*(\d+|null)\s*\}')
    for m in re.finditer(pattern, content):
        name, addr, lat, lng, sed, enr = m.groups()
        if sed == 'null' or enr == 'null':
            continue
        enrollment = int(enr)
        if enrollment < args.min_enrollment:
            continue
        schools.append({
            'name': name,
            'lat': float(lat),
            'lng': float(lng),
            'sedPct': float(sed),
            'enrollment': enrollment
        })

    if not args.json:
        print(f"Schools with SED data and enrollment >= {args.min_enrollment}: {len(schools)}")

    def haversine(lat1, lon1, lat2, lon2):
        R = 6371
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (math.sin(dlat/2)**2 +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
             math.sin(dlon/2)**2)
        return R * 2 * math.asin(math.sqrt(a))

    def shortest_route(indices):
        best = float('inf')
        for perm in itertools.permutations(indices):
            dist = sum(haversine(schools[perm[i]]['lat'], schools[perm[i]]['lng'],
                                 schools[perm[i+1]]['lat'], schools[perm[i+1]]['lng'])
                       for i in range(len(perm)-1))
            if dist < best:
                best = dist
        return best

    n = len(schools)
    dist_matrix = [[0.0]*n for _ in range(n)]
    for i in range(n):
        for j in range(i+1, n):
            d = haversine(schools[i]['lat'], schools[i]['lng'],
                          schools[j]['lat'], schools[j]['lng'])
            dist_matrix[i][j] = d
            dist_matrix[j][i] = d

    neighbors = []
    for i in range(n):
        neighbors.append([j for j in range(n)
                          if j != i and dist_matrix[i][j] <= args.max_dist])

    seen = set()
    results = []

    for anchor in range(n):
        nbs = neighbors[anchor]
        if len(nbs) < 4:
            continue
        for combo in itertools.combinations(nbs, 4):
            key = tuple(sorted((anchor,) + combo))
            if key in seen:
                continue
            seen.add(key)
            avg_sed = sum(schools[i]['sedPct'] for i in key) / 5
            if avg_sed < args.min_sed:
                continue
            route = shortest_route(key)
            sed_students = sum(round(schools[i]['sedPct'] * schools[i]['enrollment'] / 100)
                               for i in key)
            total_enrollment = sum(schools[i]['enrollment'] for i in key)
            score = avg_sed - args.weight * route
            results.append({
                'key': key,
                'avg_sed': avg_sed,
                'route_km': route,
                'score': score,
                'sed_students': sed_students,
                'total_enrollment': total_enrollment
            })

    if not args.json:
        print(f"Evaluated {len(seen)} unique clusters, {len(results)} with avg SED >= {args.min_sed}%")

    results.sort(key=lambda x: -x['score'])

    used = set()
    top = []
    for r in results:
        if set(r['key']) & used:
            continue
        top.append(r)
        used |= set(r['key'])
        if len(top) == args.top:
            break

    cluster_json = []
    for rank, c in enumerate(top, 1):
        names = [schools[i]['name'] for i in c['key']]
        cluster_json.append({
            'rank': rank,
            'schools': names,
            'avg_sed': round(c['avg_sed'], 1),
            'route_km': round(c['route_km'], 2),
            'sed_students': c['sed_students'],
            'total_enrollment': c['total_enrollment']
        })

    if args.json:
        print(json.dumps(cluster_json, indent=2))
    else:
        for rank, c in enumerate(top, 1):
            print(f"\n#{rank}: score={c['score']:.1f} | Avg SED {c['avg_sed']:.1f}% | "
                  f"Route {c['route_km']:.2f} km | "
                  f"{c['sed_students']} SED / {c['total_enrollment']} total")
            for i in c['key']:
                s = schools[i]
                print(f"   {s['sedPct']:5.1f}%  {s['name']} ({s['enrollment']})")

if __name__ == '__main__':
    main()
