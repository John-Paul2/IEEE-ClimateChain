import re,pathlib
root=pathlib.Path('web/src')
def words(path):
    t=path.read_text(encoding='utf-8',errors='ignore')
    t=re.sub(r'/\*.*?\*/','',t,flags=re.S); t=re.sub(r'(?m)^\s*//.*$','',t)
    lits=re.findall(r'"([^"\n]{3,})"|`([^`]{3,})`',t)
    n=0
    for a,b in lits:
        s=a or b
        if re.search(r'[A-Za-z]{3,}\s+[A-Za-z]{2,}',s) and not s.startswith(('http','./','../','bg-','text-','flex','border')) and not re.search(r'(px-|py-|items-|rounded|grid-)',s):
            n+=len(s.split())
    jsx=re.findall(r'>\s*([A-Za-z][^<>{}\n]{3,})\s*<',t)
    n+=sum(len(j.split()) for j in jsx)
    return n
def deps(path):
    t=path.read_text(encoding='utf-8',errors='ignore')
    out=[]
    for m in re.findall(r'from\s+"(\.\.?/components/[A-Za-z]+)"',t):
        out.append((path.parent/m).resolve().with_suffix('.tsx'))
    return out
for page in ['OperatorPage','VerifierPage','ImporterPage','BenchmarkPage','GalleryPage']:
    p=root/'pages'/f'{page}.tsx'
    own=words(p); comps=set(deps(p)); c=sum(words(x) for x in comps if x.exists())
    print(f'{page}: own={own} components={c} total~{own+c} (n_components={len(comps)})')