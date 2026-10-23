import json
d=json.load(open('calculator/config/cbam_config.json'))
def walk(o,p=''):
    if isinstance(o,dict):
        if 'value' in o and 'status' in o:
            yield p,o['value'],o['status']
        else:
            for k,v in o.items(): yield from walk(v,p+'/'+k)
for p,v,s in walk(d): print(p,v,s)