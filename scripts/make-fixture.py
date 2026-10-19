# Turns a recording (settings: "Spielverkehr aufzeichnen") into an anonymized fixture of one visited city.
# Usage: python3 -I scripts/make-fixture.py <recording.json> <player_id> <out.json>

import json,sys
rec=json.load(open(sys.argv[1])); target=int(sys.argv[2]); out=sys.argv[3]
defs={}
for r in rec:
    if r['kind']=='meta' and 'building_entity_' in r['url'] and 'lookup' not in r['url']:
        d=json.loads(r['response']); defs[d['id']]=d
visit=None
for r in rec:
    if r['kind']!='json': continue
    for e in json.loads(r['response']):
        if e.get('requestMethod')=='visitPlayer' and e['responseData']['other_player']['player_id']==target: visit=e['responseData']
era=visit['other_player_era']
ERAS=[e['era'] for e in next(json.loads(r['response']) for r in rec if r['kind']=='meta' and 'research_eras' in r['url'])]
KEEP={'AllAge',era}|{ERAS[x['level']] for x in visit['city_map']['entities'] if x.get('type')!='greatbuilding' and isinstance(x.get('level'),int) and x['level']<len(ERAS)}
KEEP_AB={'MotivatableAbility','PolishableAbility','BoostAbility','BuildingSetAbility','BonusOnSetAdjacencyAbility','ChainStartAbility','ChainLinkAbility','AddResourcesToGuildTreasuryAbility','RandomChestRewardAbility','NotPlunderableAbility'}
def eras(o):
    # keep only AllAge and the city era in any per-era map
    if isinstance(o,dict):
        if 'StoneAge' in o or 'BronzeAge' in o: o={k:v for k,v in o.items() if k in KEEP}
        return {k:eras(v) for k,v in o.items() if k not in ('description','revenue','resources_lookup')}
    if isinstance(o,list): return [eras(x) for x in o]
    return o
def trim(d):
    out={k:d[k] for k in ('id','name','__class__','type','width','length') if k in d}
    out['abilities']=eras([a for a in d.get('abilities',[]) if a['__class__'] in KEEP_AB])
    if 'components' in d:
        comps={}
        for k,v in d['components'].items():
            if k not in KEEP: continue
            comps[k]={ck:eras(cv) for ck,cv in v.items() if ck in ('boosts','production','socialInteraction','chain','placement')}
        out['components']=comps
    return out
pid=1001
ents=[dict(x, player_id=pid) for x in visit['city_map']['entities']]
fixture={'note':'Visited city recorded on de20 2026-10-19, player anonymized, definitions trimmed to AllAge and the city era.',
 'visit':{'other_player':{'player_id':pid,'name':'Testspieler','avatar':'','city_name':'Teststadt','era':era,'score':1,'rank':1,'is_neighbor':True,'clan_id':1,'clan':{'id':1,'name':'Testgilde'}},'other_player_era':era,'city_map':{'gridId':'main','entities':ents}},
 'eras':ERAS,'defs':[trim(defs[i]) for i in sorted({x['cityentity_id'] for x in ents})]}
json.dump(fixture,open(out,'w'),separators=(',',':'))
