# Turns a recording (settings: "Spielverkehr aufzeichnen") into an anonymized fixture of one visited city.
# Usage: python3 -I scripts/make-fixture.py <recording.json> <player_id> <out.json>
# Battle: python3 -I scripts/make-fixture.py battle <recording.json> <out.json>
# keeps the first PvP battle and the opponent's updatePlayer, with fake ids and names.
# Manual battle: python3 -I scripts/make-fixture.py manual-battle <recording.json> <out.json>
# keeps the first PvP battle that starts without a result and the BattlefieldService response that ends it.

import json,sys

def battle_fixture(rec,out):
    ME,OPP,BATTLE=1000,1001,5001
    batch=None
    for r in rec:
        if r['kind']!='json': continue
        entries=json.loads(r['response'])
        if any(e.get('requestMethod')=='startByBattleType' and e['responseData'].get('battleType',{}).get('type')=='pvp' for e in entries):
            batch=entries; break
    battle=next(e['responseData'] for e in batch if e.get('requestMethod')=='startByBattleType')
    ids={battle['attackerPlayerId']:ME,battle['defenderPlayerId']:OPP}
    UNIT=('ownerId','teamFlag','unitTypeId','startHitpoints','currentHitpoints')
    def unit(u):
        o={k:u[k] for k in UNIT if k in u}
        o['ownerId']=ids[u['ownerId']]
        o['bonuses']=[{k:b[k] for k in ('type','value','__class__') if k in b} for b in u.get('bonuses',[])]
        return o
    st=battle['state']
    state={k:st[k] for k in ('winnerBit','surrenderBit','round','__class__') if k in st}
    state['unitsOrder']=[unit(u) for u in st['unitsOrder']]
    bt=battle['battleType']
    data={'battleId':BATTLE,'battleType':{'attackerPlayerId':ME,'defenderPlayerId':OPP,'era':bt['era'],'type':bt['type'],'__class__':bt.get('__class__')},
      'attackerPlayerId':ME,'defenderPlayerId':OPP,'startTime':battle['startTime'],'isAutoBattle':battle['isAutoBattle'],'state':state,'__class__':battle.get('__class__')}
    opp=next(p for e in batch if e.get('requestMethod')=='updatePlayer' for p in e['responseData'] if p.get('player_id') in ids and ids[p['player_id']]==OPP)
    player={'player_id':OPP,'name':'Testgegner','avatar':'','city_name':'Gegnerstadt','era':opp.get('era'),'score':1,'rank':1,
      'is_neighbor':True,'is_active':True,'clan_id':1,'clan':{'id':1,'name':'Testgilde'},'__class__':opp.get('__class__')}
    fixture={'note':'PvP battle recorded on de20 2026-10-19 with the response batch it came in, players anonymized (me 1000, opponent 1001), unrelated entries and fields dropped.',
      'me':ME,'batch':[
        {'requestClass':'OtherPlayerService','requestMethod':'updatePlayer','responseData':[player]},
        {'requestClass':'BattlefieldService','requestMethod':'startByBattleType','responseData':data}]}
    json.dump(fixture,open(out,'w'),indent=1)

def manual_battle_fixture(rec,out):
    ME,OPP,BATTLE=1000,1001,5002
    batches=[json.loads(r['response']) for r in rec if r['kind']=='json']
    batches=[b for b in batches if isinstance(b,list)]
    def realm(e): return e.get('requestClass')=='BattlefieldService' and e['responseData']
    start=end=None
    for b in batches:
        for e in b:
            d=realm(e)
            if not d: continue
            if start is None and e['requestMethod']=='startByBattleType' and d.get('battleType',{}).get('type')=='pvp' and 'winnerBit' not in d['state']:
                start=d
            elif start is not None and d.get('__class__')=='BattleRealmState' and ('winnerBit' in d or 'surrenderBit' in d):
                end,move,batch=d,e['requestMethod'],b; break
        if end: break
    ids={start['attackerPlayerId']:ME,start['defenderPlayerId']:OPP}
    UNIT=('ownerId','teamFlag','unitTypeId','startHitpoints','currentHitpoints')
    def unit(u):
        o={k:u[k] for k in UNIT if k in u}
        o['ownerId']=ids[u['ownerId']]
        o['bonuses']=[{k:b[k] for k in ('type','value','__class__') if k in b} for b in u.get('bonuses',[])]
        return o
    def state(st):
        o={k:st[k] for k in ('winnerBit','surrenderBit','round','__class__') if k in st}
        o['unitsOrder']=[unit(u) for u in st['unitsOrder']]
        return o
    bt=start['battleType']
    data={'battleId':BATTLE,'battleType':{'attackerPlayerId':ME,'defenderPlayerId':OPP,'era':bt['era'],'type':bt['type'],'__class__':bt.get('__class__')},
      'attackerPlayerId':ME,'defenderPlayerId':OPP,'startTime':start['startTime'],'state':state(start['state']),'__class__':start.get('__class__')}
    opp=next(p for e in batch if e.get('requestMethod')=='updatePlayer' for p in e['responseData'] if ids.get(p.get('player_id'))==OPP)
    player={'player_id':OPP,'name':'Testgegner','avatar':'','city_name':'Gegnerstadt','era':opp.get('era'),'score':1,'rank':1,
      'is_neighbor':True,'is_active':True,'clan_id':1,'clan':{'id':1,'name':'Testgilde'},'__class__':opp.get('__class__')}
    fixture={'note':'Manual PvP battle recorded on de20 2026-10-19 (one manual move, then auto battle): the start and the response that ends it, players anonymized (me 1000, opponent 1001), unrelated entries and fields dropped.',
      'me':ME,
      'start':[{'requestClass':'BattlefieldService','requestMethod':'startByBattleType','responseData':data}],
      'end':[{'requestClass':'OtherPlayerService','requestMethod':'updatePlayer','responseData':[player]},
        {'requestClass':'BattlefieldService','requestMethod':move,'responseData':state(end)}]}
    json.dump(fixture,open(out,'w'),indent=1)

if sys.argv[1]=='battle':
    battle_fixture(json.load(open(sys.argv[2])),sys.argv[3]); sys.exit()
if sys.argv[1]=='manual-battle':
    manual_battle_fixture(json.load(open(sys.argv[2])),sys.argv[3]); sys.exit()
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
