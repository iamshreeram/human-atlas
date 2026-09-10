#!/usr/bin/env python3
"""One-off graft: reposition the 8 pregnancy/placenta meshes from the retired
partial 'atlas-female.json' (HRA united-female v1.5) into the full-body
'atlas-female-reconstructed.json' (BodyParts3D + HRA, PR #23), anchored on
the shared VH_F_body_of_uterus landmark that exists, with near-identical
proportions, in both source atlases.

Not part of the runtime app or the build pipeline -- a scratch script kept
for provenance/reproducibility, matching the format of the other one-off
scripts/*.py content-pipeline tools in this repo.
"""
import gzip
import json
import struct

SRC_ATLAS = 'public/models/atlas-female.json'
SRC_BIN = 'public/models/female-pregnancy-0.bin'
DST_ATLAS = 'public/models/atlas-female-reconstructed.json'
OUT_BIN = 'public/models/female-pregnancy-graft-0.bin'
OUT_GZ = OUT_BIN + '.gz'


def center(bounds):
    lo, hi = bounds
    return [(lo[i] + hi[i]) / 2 for i in range(3)]


def body_height(atlas):
    ys = [p['bounds'][0][1] for p in atlas['parts']] + [p['bounds'][1][1] for p in atlas['parts']]
    return max(ys) - min(ys)


def transform_point(p, scale, anchor_old, anchor_new):
    return [anchor_new[i] + scale * (p[i] - anchor_old[i]) for i in range(3)]


def main():
    src = json.load(open(SRC_ATLAS))
    dst = json.load(open(DST_ATLAS))
    preg_parts = [p for p in src['parts'] if p['system'] == 'pregnancy']
    assert len(preg_parts) == 8, f'expected 8 pregnancy parts, found {len(preg_parts)}'

    anchor_id = 'VH_F_body_of_uterus'
    old_anchor = center(next(p for p in src['parts'] if p['id'] == anchor_id)['bounds'])
    new_anchor = center(next(p for p in dst['parts'] if p['id'] == anchor_id)['bounds'])
    scale = body_height(dst) / body_height(src)
    print(f'anchor old={old_anchor} new={new_anchor} scale={scale:.4f}')

    with open(SRC_BIN, 'rb') as f:
        src_buf = f.read()

    out = bytearray()
    new_parts = []
    for p in preg_parts:
        vtx, idx_count = p['vertexCount'], p['indexCount']

        pos_raw = src_buf[p['positions']:p['positions'] + vtx * 3 * 4]
        positions = list(struct.unpack(f'<{vtx*3}f', pos_raw))
        transformed = []
        mins = [float('inf')] * 3
        maxs = [float('-inf')] * 3
        for i in range(vtx):
            pt = positions[i * 3:i * 3 + 3]
            tp = transform_point(pt, scale, old_anchor, new_anchor)
            transformed.extend(tp)
            for k in range(3):
                mins[k] = min(mins[k], tp[k])
                maxs[k] = max(maxs[k], tp[k])

        norm_raw = src_buf[p['normals']:p['normals'] + vtx * 3 * 2]
        idx_raw = src_buf[p['indices']:p['indices'] + idx_count * 4]

        pos_off = len(out)
        out.extend(struct.pack(f'<{vtx*3}f', *transformed))
        norm_off = len(out)
        out.extend(norm_raw)
        pad = (-len(out)) % 4
        out.extend(b'\x00' * pad)
        idx_off = len(out)
        out.extend(idx_raw)

        new_parts.append({
            **{k: v for k, v in p.items() if k not in ('chunk', 'positions', 'normals', 'indices')},
            'chunk': len(dst['chunks']),
            'positions': pos_off,
            'normals': norm_off,
            'indices': idx_off,
            'bounds': [mins, maxs],
        })
        print(f'  {p["id"]}: {vtx} verts, bounds -> {[round(x,4) for x in mins]} .. {[round(x,4) for x in maxs]}')

    with open(OUT_BIN, 'wb') as f:
        f.write(out)
    with gzip.open(OUT_GZ, 'wb', compresslevel=9) as f:
        f.write(out)

    import os
    gz_bytes = os.path.getsize(OUT_GZ)
    dst['chunks'].append({
        'url': '/models/female-pregnancy-graft-0.bin',
        'bytes': len(out),
        'system': 'pregnancy',
        'parts': len(new_parts),
        'gzip': '/models/female-pregnancy-graft-0.bin.gz',
        'gzipBytes': gz_bytes,
    })
    dst['parts'].extend(new_parts)
    dst['triangles'] = dst.get('triangles', 0) + sum(p['indexCount'] // 3 for p in new_parts)

    json.dump(dst, open(DST_ATLAS, 'w'), separators=(',', ':'))
    print(f'wrote {OUT_BIN} ({len(out)} bytes) and updated {DST_ATLAS}')
    print(f'{DST_ATLAS} now has {len(dst["parts"])} parts, {len(dst["chunks"])} chunks')


if __name__ == '__main__':
    main()
