#!/usr/bin/env python3
"""Search CHEF'STORE SF (170 S Van Ness, store #586) via Algolia API and output a CSV of prices."""
import json, csv, sys, re, urllib.request, urllib.parse

ALGOLIA_URL = 'https://70kq5feq31-dsn.algolia.net/1/indexes/*/queries'
ALGOLIA_PARAMS = {
    'x-algolia-agent': 'Algolia for JavaScript (4.12.1); Browser (lite)',
    'x-algolia-api-key': '48035a5322b28e6485ae9f3b235b150a',
    'x-algolia-application-id': '70KQ5FEQ31',
}
STORE = '586'  # SF Van Ness location

INGREDIENTS = [
    'pinto beans',
    'brown rice',
    'tofu',
    'tahini',
    'miso paste',  # not available at store 586
    'olive oil',
    'vegetable oil',
    'canola oil',
    'crushed tomatoes',
    'diced tomatoes',
    'chickpeas',
    'garbanzo beans',
    'elbow macaroni',
    'nutritional yeast',
    'margarine',
    'onions',
    'frozen spinach',
    'frozen peas',
    'lasagna',
    'curry powder',
    'cumin',
    'vegan mozzarella',
    'vegan cheese',
    'sandwich rolls',
    'hoagie rolls',
    'sub rolls',
    'cauliflower',
    'potatoes',
    'lemons',
    'garlic',
    'salt',
    'black pepper',
    'flour',
    'yellow mustard',
    'tamari',
    'soy sauce',
    'oregano',
    'basil dried',
    'thyme',
    'garlic powder',
    'white pepper',
    'cayenne',
    'bay leaves',
    'celery',
    'parsley',
    'spinach',
    'peas',
    'squash',
    'cabbage',
]


def make_slug(name):
    """Build a URL slug matching CHEF'STORE's client-side logic."""
    s = name.strip().replace(' ', '-').lower()
    s = re.sub(r'[^0-9a-z-]', '', s)
    s = re.sub(r'-+', '-', s)
    s = s.strip('-')
    parts = [p for p in s.split('-') if p not in ('and', 'or')]
    return '-'.join(parts)


def get_store_val(d, default=''):
    """Extract value for our store from a per-store dict, or return the value directly."""
    if isinstance(d, dict):
        return d.get(STORE, default)
    return d


def search(query, hits_per_page=10):
    params = '&'.join([
        'clickAnalytics=true',
        f'filters=storeNum%3D{STORE}',
        f'hitsPerPage={hits_per_page}',
        'page=0',
        f'query={urllib.parse.quote(query)}',
    ])
    body = json.dumps({
        'requests': [{'indexName': 'prod_stockton_products', 'params': params}]
    }).encode('utf-8')

    url = ALGOLIA_URL + '?' + urllib.parse.urlencode(ALGOLIA_PARAMS)
    req = urllib.request.Request(url, data=body, headers={
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.chefstore.com',
        'Referer': 'https://www.chefstore.com/',
    })
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())

    results = []
    for hit in data.get('results', [{}])[0].get('hits', []):
        # Check if item exists at our store
        exists = get_store_val(hit.get('itemExists', {}), '0')
        if exists != '1':
            continue

        name = hit.get('itemDesc1', '')
        category = hit.get('category', '')
        item_size = get_store_val(hit.get('itemSize', {}))
        pack = get_store_val(hit.get('pack', {}))
        unit_price = get_store_val(hit.get('unitSellPrice', {}), '0')
        unit_reg = get_store_val(hit.get('unitRegPrice', {}), '0')
        case_price = get_store_val(hit.get('caseSellPrice', {}), '0')
        case_reg = get_store_val(hit.get('caseRegPrice', {}), '0')
        has_case = get_store_val(hit.get('hasCase', {}), '0')
        slug = make_slug(name)
        usfitem = hit.get('usfitem', '')
        url = f'https://www.chefstore.com/p/{slug}_{usfitem}/' if usfitem else ''

        results.append({
            'search_term': query,
            'name': name,
            'category': category,
            'size': item_size,
            'pack': pack,
            'unit_price': unit_price,
            'unit_reg_price': unit_reg,
            'case_price': case_price if has_case == '1' else '',
            'case_reg_price': case_reg if has_case == '1' else '',
            'url': url,
        })
    return results


def main():
    all_results = []
    for ingredient in INGREDIENTS:
        print(f'Searching: {ingredient}...', file=sys.stderr)
        try:
            results = search(ingredient)
            if results:
                all_results.extend(results)
            else:
                all_results.append({
                    'search_term': ingredient,
                    'name': 'NOT FOUND AT THIS STORE',
                    'category': '', 'size': '', 'pack': '',
                    'unit_price': '', 'unit_reg_price': '',
                    'case_price': '', 'case_reg_price': '', 'url': '',
                })
        except Exception as e:
            print(f'  Error: {e}', file=sys.stderr)

    writer = csv.DictWriter(sys.stdout, fieldnames=[
        'search_term', 'name', 'category', 'size', 'pack',
        'unit_price', 'case_price', 'url'
    ])
    writer.writeheader()
    for r in all_results:
        writer.writerow({k: r[k] for k in writer.fieldnames})


if __name__ == '__main__':
    main()
