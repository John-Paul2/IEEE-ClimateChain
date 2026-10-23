import json
s=json.load(open('results/benchmark_summary.json'))
for k,v in s['attacks'].items():
    d=v['detectors']
    print(k, {n:round(m['recall']['mean'],3) for n,m in d.items()})