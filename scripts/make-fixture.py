# Turns a recording (settings: "Spielverkehr aufzeichnen") into an anonymized fixture of one visited city.
# Usage: python3 -I scripts/make-fixture.py <recording.json> <player_id> <out.json>
# Battle: python3 -I scripts/make-fixture.py battle <recording.json> <out.json>
# keeps the first PvP battle and the opponent's updatePlayer, with fake ids and names.
# Manual battle: python3 -I scripts/make-fixture.py manual-battle <recording.json> <out.json>
# keeps the first PvP battle that starts without a result and the BattlefieldService response that ends it.
# Plunder: python3 -I scripts/make-fixture.py plunder <recording.json> <world> <out.json> [<date>]
# keeps the plunder entries of the first batch with a plunderById, with fake ids and names. Also for a repelled one.
# Events: python3 -I scripts/make-fixture.py events <list-recording.json> <live-recording.json> <out.json>
# keeps the getEventsPaginated page with the first battle event (the battle and one event of each other kind) and the
# first websocket newEvent, with fake ids and names.
# Great buildings: python3 -I scripts/make-fixture.py gb <recording.json> <out.json>
# keeps every opening of another player's great building (the building and its construction), the overview of each
# owner for the names, the first getConstructionRanking, the own construction and the own great buildings with a
# contribution_boost from the startup data, with fake player ids and names. Also the Forge point packages of the
# inventory (getItems) and one other item, with fake item ids and without descriptions.
# Contribution: python3 -I scripts/make-fixture.py gb-contribution <start-recording.json> <contribution-recording.json> <out.json> [<entityId> …]
# keeps the opening (building and construction) of the great building contributed to and the whole response batch of
# the first contributeForgePoints. The Forge point packages of the start recording (getItems) are the inventory before,
# with the same fake item ids as in the gb mode; resources trimmed to Forge points and coins; fake player ids and names.
# Each further entity id adds the first opening of that great building as `others`.
# Own level up: python3 -I scripts/make-fixture.py gb-own-level-up <recording.json> <out.json>
# keeps the own great building from the startup data, its last opening (getConstruction) before the first own
# contribution that levels it, that contribution's contributeForgePoints, updateEntity, reset and
# getAvailablePackageForgePoints, and the websocket entity_level_up that follows, with fake player ids and names.
# Foreign level up: python3 -I scripts/make-fixture.py gb-level-up <recording.json> <out.json>
# the same for the first own contribution that levels a great building of another player: its opening (building and
# construction), the contribution's response, the owner's getOtherPlayerOverview that follows (for the names) and the
# websocket great_building_contribution, with fake player ids and names.
# Great building definitions: python3 -I scripts/make-fixture.py gb-defs <recording.json> <out.json> <cityentity_id> …
# keeps the metadata file of each named great building, trimmed to id, name, type, min_era and the level costs.

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

def plunder_fixture(rec,world,out,date='2026-10-19'):
    ME,OPP=1000,1001
    batch=next(b for b in (json.loads(r['response']) for r in rec if r['kind']=='json')
        if isinstance(b,list) and any(e.get('requestMethod')=='plunderById' for e in b))
    KEEP={'plunderById','rewardPlunder','reset','showEntityIcons','updatePlayer'}
    def entry(e):
        d=e['responseData']; m=e['requestMethod']
        if m=='updatePlayer':
            d=[{'player_id':OPP,'name':'Testgegner','avatar':'','city_name':'Gegnerstadt','era':p.get('era'),'score':1,'rank':1,
              'is_neighbor':True,'is_active':True,'__class__':p.get('__class__')} for p in d]
        if m=='reset':
            d=[dict(x,player_id=OPP) for x in d]
        return {'requestClass':e['requestClass'],'requestMethod':m,'responseData':d}
    result=next(e['responseData'].get('result') for e in batch if e.get('requestMethod')=='plunderById')
    what='Plunder' if result=='success' else f'Plunder ({result})'
    fixture={'note':f'{what} recorded on {world} {date} with the response batch it came in, players anonymized (me 1000, opponent 1001), unrelated entries dropped.',
      'me':ME,'batch':[entry(e) for e in batch if e.get('requestMethod') in KEEP]}
    json.dump(fixture,open(out,'w'),indent=1)

def events_fixture(listed,live,out):
    ME=1000
    others={}
    def other(p):
        if p['player_id'] not in others: others[p['player_id']]=1001+len(others)
        o={'player_id':others[p['player_id']],'name':f'Testspieler {others[p["player_id"]]}','avatar':'','city_name':'Teststadt'}
        return dict(o,**{k:p[k] for k in ('is_neighbor','is_friend','is_guild_member','is_active','__class__') if k in p})
    ids=iter(range(9001,10000))
    def event(e):
        o={k:v for k,v in e.items() if k not in ('other_player','id','player_id','battle_id')}
        o['id']=next(ids)
        if 'player_id' in e: o['player_id']=ME
        if 'other_player' in e: o['other_player']=other(e['other_player'])
        if 'battle_id' in e: o['battle_id']=5003
        return o
    def entries(r):
        try: parsed=json.loads(r.get('response') or r.get('data'))
        except (TypeError,ValueError): return []
        return parsed if isinstance(parsed,list) else []
    page=next(e['responseData'] for r in listed if r['kind']=='json' for e in entries(r)
        if e.get('requestMethod')=='getEventsPaginated' and any(x.get('type')=='battle' for x in e['responseData']['events']))
    kinds=set(); keep=[]
    for e in page['events']:
        kind=(e.get('type'),e.get('interaction_type'))
        if e.get('type')=='battle' or kind not in kinds: keep.append(e)
        kinds.add(kind)
    new=next(e['responseData'] for r in live if r['kind']=='ws' for e in entries(r) if e.get('requestMethod')=='newEvent')
    fixture={'note':'Event history recorded 2026-10-20 (Tuesday): one getEventsPaginated page with the battle against the session player and one event of each other kind, and a websocket newEvent; players anonymized (me 1000, others from 1001), event and battle ids replaced, unrelated fields dropped.',
      'me':ME,
      'page':[{'requestClass':'OtherPlayerService','requestMethod':'getEventsPaginated',
        'responseData':{'page':page['page'],'amountPerPage':page['amountPerPage'],'events':[event(e) for e in keep],'__class__':page.get('__class__')}}],
      'live':[{'requestClass':'OtherPlayerService','requestMethod':'newEvent','responseData':event(new)}]}
    json.dump(fixture,open(out,'w'),indent=1)

def gb_fixture(rec,out):
    ME=1000
    batches=[]
    for r in rec:
        if r['kind']!='json': continue
        try: res=json.loads(r['response']); req=json.loads(r['request'] or '[]')
        except (TypeError,ValueError): continue
        if not isinstance(res,list): continue
        reqs={(q.get('requestClass'),q.get('requestMethod')):q.get('requestData') for q in req if isinstance(q,dict)}
        batches.append([dict(e,requestData=reqs.get((e.get('requestClass'),e.get('requestMethod')))) for e in res if isinstance(e,dict)])
    startup=next(e['responseData'] for b in batches for e in b if e.get('requestMethod')=='getData' and e.get('requestClass')=='StartupService')
    me_real=startup['user_data']['player_id']
    ids={me_real:ME}; owners=iter(range(1001,1100)); others=iter(range(2001,3000))
    def pid(p,owner=False):
        if p not in ids: ids[p]=next(owners if owner else others)
        return ids[p]
    def name(p): return 'Ich' if p==ME else (f'Eigentümer {p}' if p<2000 else f'Spieler {p}')
    def entity(x):
        st=x.get('state',{})
        o={k:x[k] for k in ('id','cityentity_id','type','x','y','connected','level','max_level') if k in x}
        o['player_id']=pid(x['player_id'],True)
        o['state']={k:st[k] for k in ('invested_forge_points','forge_points_for_level_up','__class__') if k in st}
        if x.get('bonus'): o['bonus']={k:x['bonus'][k] for k in ('type','value','amount','__class__') if k in x['bonus']}
        return o
    def row(x):
        o={k:x[k] for k in ('rank','forge_points','reward','__class__') if k in x}
        p=x.get('player',{})
        if 'player_id' in p:
            n=pid(p['player_id']); player={'player_id':n,'name':name(n),'avatar':''}
        elif 'forge_points' in x: player={'name':'Gelöschter Spieler','avatar':''}
        else: player={'name':p.get('name',''),'avatar':''}
        if p.get('is_self'): player['is_self']=True
        o['player']=dict(player,__class__=p.get('__class__'))
        return o
    def entry(e,data,req):
        return {'requestClass':e['requestClass'],'requestMethod':e['requestMethod'],'requestData':req,'responseData':data}
    flat=[e for b in batches for e in b]
    openings=[]; own=None; ranking=None; overviews={}
    for i,e in enumerate(flat):
        m=e.get('requestMethod'); req=e.get('requestData')
        if m=='getConstruction':
            ent_id,owner=req[0],req[1]
            if owner!=me_real: pid(owner,True)
            d=dict(e['responseData'],rankings=[row(x) for x in e['responseData']['rankings']])
            d={k:v for k,v in d.items() if k in ('rankings','ownerEra','__class__')}
            if owner==me_real:
                if own is None: own=entry(e,d,[ent_id,ME])
                continue
            ent=next(x for x in reversed(flat[:i]) if x.get('requestMethod')=='getOtherPlayerCityMapEntity' and x.get('requestData')==req)
            o=pid(owner,True)
            openings.append({'entity':entry(ent,entity(ent['responseData']),[ent_id,o]),'construction':entry(e,d,[ent_id,o])})
        elif m=='getConstructionRanking' and ranking is None and req[1]!=me_real:
            pid(req[1],True)
            ranking=entry(e,[row(x) for x in e['responseData']],[req[0],pid(req[1],True),req[2]])
        elif m=='getOtherPlayerOverview' and req and req[0] not in overviews:
            overviews[req[0]]=e
    names=[]
    for real,e in overviews.items():
        if real not in ids: continue
        names.append(entry(e,[{k:x[k] for k in ('entity_id','city_entity_id','name','level') if k in x} for x in e['responseData']],[ids[real]]))
    items=next(e['responseData'] for e in flat if e.get('requestClass')=='InventoryService' and e.get('requestMethod')=='getItems')
    fp=[x for x in items if x.get('item',{}).get('__class__')=='ForgePointPackagePayload']
    other=next(x for x in items if x.get('item',{}).get('__class__')=='BoostItemPayload')
    inventory=[dict({k:x[k] for k in ('name','inStock','item','itemAssetName','__class__') if k in x},id=9001+i) for i,x in enumerate(fp+[other])]
    arc=[entity(x) for x in startup['city_map']['entities'] if x.get('type')=='greatbuilding' and (x.get('bonus') or {}).get('type')=='contribution_boost']
    ids[me_real]=ME
    fixture={'note':'Great building openings recorded on de20 2026-10-21: four buildings of other players (the building and its construction), the overview of each owner for the names, a finished level (getConstructionRanking), the own Arc construction and the own Arc from the startup data. Player ids and names replaced (me 1000, owners from 1001, others from 2001), unrelated fields dropped.',
      'me':ME,
      'startup':[{'requestClass':'StartupService','requestMethod':'getData','requestData':None,'responseData':{
        'user_data':{'player_id':ME,'user_name':'Ich','era':startup['user_data'].get('era')},
        'city_map':{'gridId':'main','entities':arc}}}],
      'inventory':[{'requestClass':'InventoryService','requestMethod':'getItems','requestData':[],'responseData':inventory}],
      'openings':openings,'overviews':names,'ranking':ranking,'own':own}
    json.dump(fixture,open(out,'w'),indent=1,ensure_ascii=False)

def gb_contribution_fixture(start,rec,out,extra=()):
    ME=1000
    items=next(e['responseData'] for r in start if r['kind']=='json' for e in json.loads(r['response'])
        if e.get('requestClass')=='InventoryService' and e.get('requestMethod')=='getItems')
    fp=[x for x in items if x.get('item',{}).get('__class__')=='ForgePointPackagePayload']
    item_ids={x['id']:9001+i for i,x in enumerate(fp)}
    inventory=[dict({k:x[k] for k in ('name','inStock','item','itemAssetName','__class__') if k in x},id=item_ids[x['id']]) for x in fp]
    me_real=next(e['responseData']['user_data']['player_id'] for r in start if r['kind']=='json' for e in json.loads(r['response'])
        if e.get('requestMethod')=='getData' and e.get('requestClass')=='StartupService')
    batches=[]
    for r in rec:
        if r['kind']!='json': continue
        try: res=json.loads(r['response']); req=json.loads(r['request'] or '[]')
        except (TypeError,ValueError): continue
        reqs={(q.get('requestClass'),q.get('requestMethod')):q.get('requestData') for q in req if isinstance(q,dict)}
        batches.append([dict(e,requestData=reqs.get((e.get('requestClass'),e.get('requestMethod')))) for e in res if isinstance(e,dict)])
    batch=next(b for b in batches if any(e.get('requestMethod')=='contributeForgePoints' for e in b))
    target=next(e['requestData'] for e in batch if e.get('requestMethod')=='contributeForgePoints')
    ent_real,owner_real=target[0],target[1]
    ids={me_real:ME,owner_real:1001}; others=iter(range(2001,3000))
    def pid(p):
        if p not in ids: ids[p]=next(others)
        return ids[p]
    def name(p): return 'Ich' if p==ME else (f'Eigentümer {p}' if p<2000 else f'Spieler {p}')
    def row(x):
        o={k:x[k] for k in ('rank','forge_points','reward','__class__') if k in x}
        p=x.get('player',{})
        if 'player_id' in p:
            n=pid(p['player_id']); player={'player_id':n,'name':name(n),'avatar':''}
        else: player={'name':p.get('name',''),'avatar':''}
        if p.get('is_self'): player['is_self']=True
        o['player']=dict(player,__class__=p.get('__class__'))
        return o
    def entity(x):
        st=x.get('state',{})
        o={k:x[k] for k in ('id','cityentity_id','type','x','y','connected','level','max_level','__class__') if k in x}
        o['player_id']=pid(x['player_id'])
        o['state']={k:st[k] for k in ('invested_forge_points','forge_points_for_level_up','__class__') if k in st}
        if x.get('bonus'): o['bonus']={k:x['bonus'][k] for k in ('type','value','__class__') if k in x['bonus']}
        return o
    def entry(e,data,req):
        return {'requestClass':e['requestClass'],'requestMethod':e['requestMethod'],'requestData':req,'responseData':data}
    flat=[e for b in batches for e in b]
    ent=next(e for e in flat if e.get('requestMethod')=='getOtherPlayerCityMapEntity' and e['requestData'][:2]==[ent_real,owner_real])
    con=next(e for e in flat if e.get('requestMethod')=='getConstruction' and e['requestData'][:2]==[ent_real,owner_real])
    opening=[entry(ent,entity(ent['responseData']),[ent_real,1001]),
        entry(con,{'rankings':[row(x) for x in con['responseData']['rankings']],'__class__':con['responseData'].get('__class__')},[ent_real,1001])]
    more=[]
    for x in extra:
        ent_x=next(e for e in flat if e.get('requestMethod')=='getOtherPlayerCityMapEntity' and e['requestData'][0]==x)
        con_x=next(e for e in flat if e.get('requestMethod')=='getConstruction' and e['requestData'][:2]==ent_x['requestData'][:2])
        o=pid(ent_x['requestData'][1])
        more.append([entry(ent_x,entity(ent_x['responseData']),[x,o]),
            entry(con_x,{'rankings':[row(r) for r in con_x['responseData']['rankings']],'__class__':con_x['responseData'].get('__class__')},[x,o])])
    out_batch=[]
    for e in batch:
        m=e.get('requestMethod'); d=e['responseData']
        if m=='getPlayerResourceBag':
            res=d['resources']['resources']
            d={'type':d['type'],'resources':{'resources':{k:res[k] for k in ('strategy_points','money') if k in res},'__class__':d['resources'].get('__class__')},'__class__':d.get('__class__')}
            out_batch.append(entry(e,d,None))
        elif m=='updateItem':
            out_batch.append(entry(e,dict(d,id=item_ids.get(d['id'],d['id'])),None))
        elif m=='contributeForgePoints':
            out_batch.append(entry(e,[row(x) for x in d],[ent_real,1001]+e['requestData'][2:]))
        elif m=='reset':
            out_batch.append(entry(e,[entity(x) for x in d],None))
        elif m in ('getAvailablePackageForgePoints','updateTime','getPlayerAutoRefills'):
            out_batch.append(entry(e,d,e.get('requestData')))
    fixture={'note':'Own contribution to a great building of another player recorded on de20 2026-10-21: the opening (building and construction) and the whole response batch of contributeForgePoints in the order the game sent it. Inventory before: the Forge point packages of the start recording of the same day. Players anonymized (me 1000, owner 1001, others from 2001), item ids as in great-buildings.json, resources trimmed.',
      'me':ME,
      'startup':[{'requestClass':'StartupService','requestMethod':'getData','requestData':None,'responseData':{'user_data':{'player_id':ME,'user_name':'Ich','era':'VirtualFuture'},'city_map':{'gridId':'main','entities':[]}}}],
      'inventory':[{'requestClass':'InventoryService','requestMethod':'getItems','requestData':[],'responseData':inventory}],
      'opening':opening,'contribution':out_batch,**({'others':more} if more else {})}
    json.dump(fixture,open(out,'w'),indent=1,ensure_ascii=False)

def gb_defs_fixture(rec,out,ids):
    files=[]
    for r in rec:
        if r['kind']!='meta' or 'building_entity_X_' not in r['url']: continue
        d=json.loads(r['response'])
        if d.get('id') not in ids or any(f['json']['id']==d['id'] for f in files): continue
        trimmed={'id':d['id'],'name':d['name'],'type':d['type'],'requirements':{'min_era':d['requirements']['min_era']},
          'strategy_points_for_upgrade':d['strategy_points_for_upgrade'],'__class__':d.get('__class__')}
        files.append({'url':r['url'].split('-')[0]+'-0','json':trimmed})
    files.sort(key=lambda f:ids.index(f['json']['id']))
    fixture={'note':'Great building definitions (metadata building_entity_<id>) recorded on de20 2026-10-19, trimmed to what the level preview reads.','files':files}
    json.dump(fixture,open(out,'w'),indent=1,ensure_ascii=False)

def gb_level_up_fixture(rec,out,own):
    ME,OWNER=1000,1001
    entries=[]
    for r in rec:
        if r['kind']=='ws':
            try: res=json.loads(r['data'])
            except (TypeError,ValueError): continue
            entries+=[dict(e,requestData=None) for e in (res if isinstance(res,list) else []) if isinstance(e,dict)]
            continue
        if r['kind']!='json': continue
        try: res=json.loads(r['response']); req=json.loads(r['request'] or '[]')
        except (TypeError,ValueError): continue
        if not isinstance(res,list): continue
        reqs={(q.get('requestClass'),q.get('requestMethod')):q.get('requestData') for q in req if isinstance(q,dict)}
        batch=len(entries)
        entries+=[dict(e,requestData=reqs.get((e.get('requestClass'),e.get('requestMethod'))),batch=batch) for e in res if isinstance(e,dict)]
    startup=next(e['responseData'] for e in entries if e.get('requestMethod')=='getData' and e.get('requestClass')=='StartupService')
    me_real=startup['user_data']['player_id']
    def levels_up(e):
        if e.get('requestMethod')!='contributeForgePoints' or (e['requestData'][1]==me_real)!=own: return False
        return any(x.get('requestMethod')=='reset' and x.get('batch')==e['batch'] and any(y.get('id')==e['requestData'][0] and y.get('level',0)>e['requestData'][2] for y in x['responseData']) for x in entries)
    con_i=next(i for i,e in enumerate(entries) if levels_up(e))
    contribution=entries[con_i]; ent_id,owner_real=contribution['requestData'][:2]; batch_id=contribution['batch']
    ids={me_real:ME}
    if not own: ids[owner_real]=OWNER
    others=iter(range(2001,3000))
    def pid(p):
        if p not in ids: ids[p]=next(others)
        return ids[p]
    owner=pid(owner_real)
    def name(p): return 'Ich' if p==ME else (f'Eigentümer {p}' if p==OWNER else f'Spieler {p}')
    def row(x):
        o={k:x[k] for k in ('rank','forge_points','reward','__class__') if k in x}
        p=x.get('player',{})
        if 'player_id' in p:
            n=pid(p['player_id']); player={'player_id':n,'name':name(n),'avatar':''}
        else: player={'name':p.get('name',''),'avatar':''}
        if p.get('is_self'): player['is_self']=True
        o['player']=dict(player,__class__=p.get('__class__'))
        return o
    def entity(x):
        st=x.get('state',{})
        o={k:x[k] for k in ('id','cityentity_id','type','x','y','connected','level','max_level','__class__') if k in x}
        o['player_id']=pid(x['player_id'])
        o['state']={k:st[k] for k in ('invested_forge_points','forge_points_for_level_up','__class__') if k in st}
        return o
    def entry(e,data,req):
        return {'requestClass':e['requestClass'],'requestMethod':e['requestMethod'],'requestData':req,'responseData':data}
    def before(method):
        return next(e for e in reversed(entries[:con_i]) if e.get('requestMethod')==method and e['requestData'][:2]==[ent_id,owner_real])
    con=before('getConstruction')['responseData']
    opening=[entry(before('getConstruction'),{'rankings':[row(x) for x in con['rankings']],'__class__':con.get('__class__')},[ent_id,owner])]
    if not own:
        ent=before('getOtherPlayerCityMapEntity')
        opening.insert(0,entry(ent,entity(ent['responseData']),[ent_id,owner]))
    out_batch=[]
    for e in entries:
        if e.get('batch')!=batch_id: continue
        m=e.get('requestMethod'); d=e['responseData']
        if m=='contributeForgePoints':
            out_batch.append(entry(e,[row(x) for x in d],[ent_id,owner]+e['requestData'][2:]))
        elif m in ('updateEntity','reset'):
            out_batch.append(entry(e,[entity(x) for x in d if x.get('id')==ent_id],None))
        elif m=='getAvailablePackageForgePoints':
            out_batch.append(entry(e,d,e.get('requestData')))
    after=entries[con_i:]
    if own:
        ev=next(e for e in after if e.get('requestMethod')=='newEvent' and e['responseData'].get('type')=='entity_level_up' and e['responseData'].get('city_map_entity_id')==ent_id)
        d=ev['responseData']
        event=entry(ev,dict({k:d[k] for k in ('type','city_map_entity_id','cityentity_id','level','__class__') if k in d},id=7001,player_id=ME),None)
    else:
        ev=next(e for e in after if e.get('requestMethod')=='newEvent' and e['responseData'].get('type')=='great_building_contribution' and e['responseData'].get('other_player',{}).get('player_id')==owner_real)
        d=ev['responseData']; op=d['other_player']
        event=entry(ev,dict({k:d[k] for k in ('type','great_building_name','level','rank','__class__') if k in d},id=7001,player_id=ME,
            other_player={'player_id':owner,'name':name(owner),'avatar':'','__class__':op.get('__class__')}),None)
    building=[entity(x) for x in startup['city_map']['entities'] if own and x.get('id')==ent_id]
    fixture={'me':ME,
      'startup':[{'requestClass':'StartupService','requestMethod':'getData','requestData':None,'responseData':{
        'user_data':{'player_id':ME,'user_name':'Ich','era':startup['user_data'].get('era')},
        'city_map':{'gridId':'main','entities':building}}}],
      'opening':opening,'contribution':out_batch,'event':event}
    if own:
        fixture['note']='Own great building levelled up by an own contribution, recorded on de20 2026-10-23: the building from the startup data, its opening (getConstruction), the contribution response batch that levels it (contributeForgePoints with the empty rankings of the new level, updateEntity and reset with the new level) and the websocket entity_level_up that follows. Players anonymized (me 1000, others from 2001), unrelated entries and fields dropped.'
    else:
        ov=next(e for e in after if e.get('requestMethod')=='getOtherPlayerOverview' and e['requestData']==[owner_real])
        fixture['overview']=entry(ov,[dict({k:x[k] for k in ('entity_id','city_entity_id','name','level','current_progress','max_progress','__class__') if k in x},
            player={'player_id':owner,'name':name(owner),'avatar':'','__class__':x.get('player',{}).get('__class__')}) for x in ov['responseData']],[owner])
        fixture['note']="Great building of another player levelled up by an own contribution, recorded on de20 2026-10-23: the opening (building and construction), the contribution response batch that levels it (contributeForgePoints with the empty rankings of the new level, reset with the building on the new level), the owner's overview the game asks for next (names of the buildings) and the websocket great_building_contribution that follows. Players anonymized (me 1000, owner 1001, others from 2001), unrelated entries and fields dropped."
    fixture={k:fixture[k] for k in ('note','me','startup','opening','contribution','overview','event') if k in fixture}
    json.dump(fixture,open(out,'w'),indent=1,ensure_ascii=False)

if sys.argv[1] in ('gb-own-level-up','gb-level-up'):
    gb_level_up_fixture(json.load(open(sys.argv[2])),sys.argv[3],sys.argv[1]=='gb-own-level-up'); sys.exit()
if sys.argv[1]=='gb-defs':
    gb_defs_fixture(json.load(open(sys.argv[2])),sys.argv[3],sys.argv[4:]); sys.exit()
if sys.argv[1]=='gb-contribution':
    gb_contribution_fixture(json.load(open(sys.argv[2])),json.load(open(sys.argv[3])),sys.argv[4],[int(x) for x in sys.argv[5:]]); sys.exit()
if sys.argv[1]=='gb':
    gb_fixture(json.load(open(sys.argv[2])),sys.argv[3]); sys.exit()
if sys.argv[1]=='events':
    events_fixture(json.load(open(sys.argv[2])),json.load(open(sys.argv[3])),sys.argv[4]); sys.exit()
if sys.argv[1]=='plunder':
    plunder_fixture(json.load(open(sys.argv[2])),sys.argv[3],sys.argv[4],*sys.argv[5:6]); sys.exit()
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
