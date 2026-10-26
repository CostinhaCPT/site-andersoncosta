import json,re,sys,statistics,unicodedata,os,glob
sys.path.insert(0,'scripts')
from conteudo import C
U='/mnt/user-data/uploads/'
src=json.load(open(U+'2 - Site Anderson/Cadastro Imoveis/lancamento-20.json'))
allp=json.load(open(U+'teste/sartori-imoveis.json'))
NB={'tres-rios-do-norte':'Três Rios do Norte','tres-rios-do-sul':'Três Rios do Sul','ilha-da-figueira':'Ilha da Figueira','centro':'Centro','amizade':'Amizade','vila-nova':'Vila Nova','nereu-ramos':'Nereu Ramos'}
TP={'casa-geminada':'Geminado','apartamento':'Apartamento','casa':'Casa'}
# preco m2 por bairro (amostra dos anuncios acompanhados)
pm={}
for x in allp:
    m=re.match(r'venda-(.+?)-(\d+)-quartos-(.+)-jaragua-do-sul-(\d+)m2$',x['slug']); p=(x['raw'].get('offers') or {}).get('price')
    if m and p:
        g='apto' if m.group(1)=='apartamento' else 'casa'
        pm.setdefault((m.group(3),g),[]).append(p/int(m.group(4))); pm.setdefault(('*',g),[]).append(p/int(m.group(4)))
def n(s): return int(re.sub(r'\D','',s or '0') or 0)
out=[]
for s in src:
    c=C[s['codigo_ac']];f=s['ficha'];area=n(f.get('Construída'));terr=n(f.get('Área Total'))
    if s['codigo_ac']=='AC-0014': s['bairro']='amizade'  # confirmado pelas fotos originais (Ninho Verde)
    b=s['bairro'];g='apto' if s['tipo']=='apartamento' else 'casa';amostra=pm.get((b,g),[])
    ref=statistics.median(amostra) if len(amostra)>=4 else statistics.median(pm[('*',g)])
    slug=f"{s['codigo_ac'].lower()}-{s['tipo'].replace('casa-geminada','geminado')}-{f.get('Quartos')}-quartos-{b}-jaragua-do-sul"
    out.append(dict(codigo=s['codigo_ac'],slug=slug,titulo=c['titulo'],resumo=c['resumo'],descricao=c['descricao'],destaques=c['destaques'],atencao=c['atencao'],
      tipo=TP[s['tipo']],tipoSlug=s['tipo'],bairro=NB.get(b,b),bairroSlug=b,cidade='Jaraguá do Sul',cidadeSlug='jaragua-do-sul',preco=int(s['preco']),precoVisivel=True,
      area=area,terreno=terr if terr!=area else None,quartos=n(f.get('Quartos')),suites=n(f.get('Suítes')),banheiros=n(f.get('Banheiros')),vagas=n(f.get('Vagas')),
      fotos=sorted(f"/fotos/{s['codigo_ac'].lower()}/{os.path.basename(x)}" for x in glob.glob(f"public/fotos/{s['codigo_ac'].lower()}/[0-9][0-9].webp")),fotosOrigem=s['fotos'],video=None,precoM2=round(int(s['preco'])/area),refM2=round(ref),refAmostra=len(amostra) if len(amostra)>=4 else None,
      faixa='ate-850' if int(s['preco'])<=850000 else ('850-1000' if int(s['preco'])<=1000000 else 'acima-1000'),destaque=s['codigo_ac'] in ('AC-0003','AC-0008','AC-0014','AC-0019')))
json.dump(out,open('data/imoveis.json','w'),ensure_ascii=False,indent=1)
for o in out: print(o['codigo'],o['precoM2'],o['refM2'],o['refAmostra'])

