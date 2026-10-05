"""Create a compact globe-scale admin-1 snapshot from Natural Earth GeoJSON.
Usage: python scripts/build-globe-boundaries.py /path/to/ne_10m_admin_1_states_provinces_lines.geojson
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path


def simplify(line, tolerance=0.04):
    """Douglas-Peucker simplification preserving shared line endpoints."""
    if len(line) < 3:
        return line
    keep = {0, len(line) - 1}
    pending = [(0, len(line) - 1)]
    while pending:
        start, end = pending.pop()
        ax, ay = line[start][:2]
        bx, by = line[end][:2]
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        best, index = tolerance * tolerance, None
        for i in range(start + 1, end):
            px, py = line[i][:2]
            t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) if length2 else 0
            distance2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if distance2 > best:
                best, index = distance2, i
        if index is not None:
            keep.add(index)
            pending.extend(((start, index), (index, end)))
    return [line[i] for i in sorted(keep)]


def build(source):
    groups = defaultdict(list)
    names = {}
    for feature in source['features']:
        geometry = feature.get('geometry')
        if not geometry:
            continue
        props = feature['properties']
        code = props.get('ADM0_A3') or 'UNK'
        names[code] = props.get('ADM0_NAME') or 'Unassigned'
        lines = [geometry['coordinates']] if geometry['type'] == 'LineString' else geometry['coordinates']
        for line in lines:
            if len(line) < 2:
                continue
            groups[code].append([[round(x, 5), round(y, 5)] for x, y, *_ in line])
    for code, lines in groups.items():
        # Rejoin degree-two endpoints before simplifying so small source fragments
        # do not become thousands of separate canvas paths or lose continuity.
        adjacency = defaultdict(list)
        for index, line in enumerate(lines):
            adjacency[tuple(line[0])].append(index)
            adjacency[tuple(line[-1])].append(index)
        used = set()
        joined = []
        def follow(index, start):
            result = []
            node = start
            while index not in used:
                used.add(index)
                line = lines[index]
                if tuple(line[0]) != node:
                    line = list(reversed(line))
                result.extend(line if not result else line[1:])
                node = tuple(line[-1])
                candidates = [i for i in adjacency[node] if i not in used]
                if len(adjacency[node]) != 2 or not candidates:
                    break
                index = candidates[0]
            compact = simplify(result, 0.06)
            if max(p[0] for p in compact) - min(p[0] for p in compact) >= 0.02 or max(p[1] for p in compact) - min(p[1] for p in compact) >= 0.02:
                joined.append(compact)
        for node, edges in adjacency.items():
            if len(edges) != 2:
                for index in edges:
                    if index not in used:
                        follow(index, node)
        for index, line in enumerate(lines):
            if index not in used:
                follow(index, tuple(line[0]))
        groups[code] = joined
    return {'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'properties': {'country': code, 'name': names[code]},
         'geometry': {'type': 'MultiLineString', 'coordinates': groups[code]}}
        for code in sorted(groups)
    ]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path('lib/data/natural-earth-states.json'))
    args = parser.parse_args()
    collection = build(json.loads(args.source.read_text()))
    args.output.write_text(json.dumps(collection, separators=(',', ':')) + '\n')
    print(f"{len(collection['features'])} administrative areas; {args.output.stat().st_size:,} bytes")
