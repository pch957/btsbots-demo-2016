#!/usr/bin/env python3
import pymongo
import datetime
from misc import id_to_int

try:
    import asyncio
except ImportError:
    import trollius as asyncio


class MonitorHelper(object):
    def __init__(self, config):
        self.last_fill_order = None
        self.object_info = {}
        self.time = [999999999, 0]

        self.connect_db(config)
        self.init_handles()
        self.init_u_key()

    def init_handles(self):
        self.handler = {
            0: self.handle_transfer,
            1: self.handle_order,
            2: self.handle_cancel,
            3: self.handle_debt,
            4: self.handle_filled,
            14: self.handle_issue,
            15: self.handle_burn,
            16: self.handle_feepool,
            17: self.handle_settle,
            33: self.handle_vesting,
            37: self.handle_claim,
            38: self.handle_transfer,
            39: self.handle_toblind,
            41: self.handle_fromblind,
            42: self.handle_cancelsettle,
            43: self.handle_feeclaim}

    def connect_db(self, _config):
        _client = pymongo.MongoClient(_config['host'], _config['port'])
        _db = _client[_config['db']]

        self.db_op = _db["op"]
        self.db_memo = _db["memo"]
        self.db_order = _db["order"]
        self.db_order_history = _db["order_history"]
        self.db_bc = _db["balance_change"]
        self.db_balance = _db["balance"]
        self.db_gp = _db["global_properties"]

    def init_p(self, p):
        self.protocal = p
        self.init_begin_op()

    def init_begin_op(self):
        _gp = self.db_gp.find_one({})
        if not _gp or 'begin_op' not in _gp:
            print("no found")
            self.db_op.create_index([('id', pymongo.ASCENDING)], unique=True)
            self.db_order_history.create_index([('id', pymongo.ASCENDING)], unique=True)
            self.db_bc.create_index([('B', pymongo.ASCENDING)])
            # self.protocal.op_id_begin = '1.11.0'
            self.protocal.op_id_begin = None
        else:
            print("begin id is: %s" % _gp['begin_op'])
            self.protocal.op_id_begin = _gp['begin_op']

    def save_begin_op(self, _id, _safe_b):
        self.db_gp.update_one(
            {}, {'$set': {'begin_op': _id, 'safe_B': _safe_b}}, True)

    def init_u_key(self):
        # 9 account_transfer,
        # 25/26/27/28 withdraw  permission
        # 32 vesting balance create, 36 assert operation,

        # 31 can't find owner
        # 37 no fee, 40/41 blind ..
        # 44 fba distribute
        self.u_key = {
            0: 'from', 1: 'seller', 2: 'fee_paying_account',
            3: 'funding_account', 4: 'account_id', 5: 'registrar',
            6: 'account', 7: 'authorizing_account', 8: 'account_to_upgrade',
            10: 'issuer', 11: 'issuer', 12: 'issuer', 13: 'issuer',
            14: 'issuer', 15: 'payer', 16: 'from_account', 17: 'account',
            18: 'issuer', 19: 'publisher', 20: 'witness_account',
            21: 'witness_account', 22: 'fee_paying_account',
            23: 'fee_paying_account', 24: 'fee_paying_account',
            29: 'committee_member_account', 30: 'committee_member_account',
            33: 'owner', 34: 'owner', 35: 'payer', 38: 'issuer', 39: 'from',
            42: 'account', 43: 'issuer'
            }

    @asyncio.coroutine
    def get_object(self, _id):
        if _id not in self.object_info:
            response = yield from self.protocal.rpc(
                [self.protocal.database_api, "get_objects", [[_id]]])
            self.object_info[_id] = response[0]
        return self.object_info[_id]

    def handle_gp(self, notify):
        _block = notify["head_block_number"]
        _time = int(
            datetime.datetime.strptime(
                notify["time"]+"+0000", "%Y-%m-%dT%H:%M:%S%z").timestamp())
        self.db_gp.update_one({}, {"$set": {
            "B": _block, "T": _time, "id": notify["head_block_id"]}}, True)
        self.time = [_block, _time]

    @asyncio.coroutine
    def handle_operation(self, notify):
        if not notify:
            return
        _op_type = notify["op"][0]
        # print(notify["id"])
        _r = {}
        _r["B"] = notify["block_num"]
        _r["t"] = _op_type
        _r["id"] = id_to_int(notify["id"])
        _offset = self.time[0]-notify['block_num']
        if _offset < 100:
            _r['T'] = self.time[1]-_offset*3
        else:
            _r['T'] = None
        if notify["result"][1]:
            _r['r'] = notify['result'][1]

        yield from self.handle_fee(notify["op"][1], _r)
        if _op_type in self.handler:
            yield from self.handler[_op_type](notify["op"][1], _r)

    @asyncio.coroutine
    def get_b(self, _info):
        _asset_info = yield from self.get_object(_info["asset_id"])
        _a = _asset_info["symbol"]
        _b = float(_info["amount"])/10**_asset_info["precision"]
        return _b, _a

    @asyncio.coroutine
    def get_u(self, _id):
        response = yield from self.get_object(_id)
        return response["name"]

    def add_b2(self, _u, _a, _b):
        self.db_balance.update_one(
            {'u': _u, 'a': _a}, {'$inc': {'b': _b}}, True)

    def add_b(self, _B, _u, _a, _b):
        self.db_bc.update_one(
            {'B': _B, 'u': _u, 'a': _a}, {'$inc': {'b': _b}}, True)
        self.add_b2(_u, _a, _b)

    def is_zero(self, _b, _a_id):
        return _b*(10**self.object_info[_a_id]["precision"]) < 0.1

    @asyncio.coroutine
    def handle_transfer(self, _info, _r):
        # 增加 op
        # 增加 memo
        # balance_change 增加 block from -fee
        # balance_change 增加 block from -amount
        # balance_change 增加 block to +amount
        if "memo" in _info:
            result = self.db_memo.insert_one(_info["memo"])
            _r["m"] = result.inserted_id
        else:
            _r["m"] = None
        # can't use this for op overwrite transfer
        # _r["u_f"] = _r.pop('u')
        _r["u_f"] = yield from self.get_u(_info["from"])
        _r["u_t"] = yield from self.get_u(_info["to"])
        _r['b'], _r['a'] = yield from self.get_b(_info["amount"])
        # print("[33m[%s] %s sent %s %s to %s[m" % (
        #     datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        #     _r["u_f"], _r["b"], _r["a"], _r["u_t"]))
        try:
            self.db_op.insert(_r)
        except Exception as e:
            print('error', e)

        self.add_b(_r['B'], _r['u_f'],  _r['a'], -_r['b'])
        self.add_b(_r['B'], _r['u_t'],  _r['a'], _r['b'])

    @asyncio.coroutine
    def handle_debt(self, _info, _r):
        # op 增加 id, block, time, type, user, debt, collateral
        # orders 增加/更新/删除 order_id(1.8.xxx/空) account, xxx xxx
        # balance_change 增加 block user -fee
        yield from self.handle_debt_1(_info, _r)
        self.handle_debt_2(_info, _r)

    @asyncio.coroutine
    def handle_debt_1(self, _info, _r):
        for _type in ["delta_collateral", "delta_debt"]:
            _b, _a = yield from self.get_b(_info[_type])
            _r['a_%s' % _type[6]] = _a
            _r['b_%s' % _type[6]] = _b
        # print("[31m[%s] %s adjust collateral by %s %s, debt by %s %s[m" % (
        #     datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        #     _r["u"], _r["b_c"], _r["a_c"], _r["b_d"], _r["a_d"]))
        try:
            self.db_op.insert(_r)
        except Exception as e:
            print('error', e)

    def handle_debt_2(self, _info, _r):
        _b_c = _r['b_c']
        _b_d = _r['b_d']
        _filter = {'u': _r['u'], 'a_c': _r['a_c'], 'a_d': _r['a_d']}
        _o_info = self.db_order.find_one(_filter)
        if not _o_info:
            self.db_order.insert_one(
                {**_filter, 'b_c': _b_c, 'b_d': _b_d, 't': 8})
        else:
            _b_c += _o_info['b_c']
            _b_d += _o_info['b_d']
            if self.is_zero(_b_d, _info['delta_debt']['asset_id']):
                self.db_order.delete_one(_filter)
            else:
                self.db_order.update_one(
                    _filter, {'$set': {'b_c': _b_c, 'b_d': _b_d}}, True)

    @asyncio.coroutine
    def handle_filled(self, _info, _r):
        # op 增加 id, block, time, type, maker, paid, received, taker
        # orders 更新/删除 order 1.4/1.7/1.8, 调整1.7的deferred_fee
        # balance_change 增加 taker -fee
        # balance_change 增加 taker -paid
        # balance_change 增加 taker +received
        # balance_change 增加 maker -fee
        # balance_change 增加 maker +paid
        # balance_change 增加 maker -received
        yield from self.handle_filled_b(_info, _r)
        self.handle_filled_o(_info, _r)
        self.handle_filled_op(_r)

    @asyncio.coroutine
    def handle_filled_b(self, _info, _r):
        for _type in ["pays", "receives"]:
            _b, _a = yield from self.get_b(_info[_type])
            _r['a_%s' % _type[0]] = _a
            _r['b_%s' % _type[0]] = _b
        self.add_b(_r['B'], _r['u'],  _r['a_p'], -_r['b_p'])
        self.add_b(_r['B'], _r['u'],  _r['a_r'], _r['b_r'])

    def handle_filled_o(self, _info, _r):
        _id = _info['order_id']
        pay = {'b': _r['b_p'], 'a': _r['a_p']}
        receive = {'b': _r['b_r'], 'a': _r['a_r']}

        if _id[2] == '7':
            self.handle_filled_o7(id_to_int(_id), pay, _info)
        elif _id[2] == '8':
            self.handle_filled_o8(_r['u'], pay, receive, _info)
        else:
            self.handle_filled_o4(id_to_int(_id), pay, _info, _r['u'])

    def handle_filled_op(self, _r):
        if self.last_fill_order is None:
            self.last_fill_order = _r
            return
        _r2 = self.last_fill_order
        if [_r['a_p'], _r['b_p']] != [_r2['a_r'], _r2['b_r']]:
            self.last_fill_order = _r
            return
        if [_r2['a_p'], _r2['b_p']] != [_r['a_r'], _r['b_r']]:
            self.last_fill_order = _r
            return
        self.last_fill_order = None
        _r2['u_t'] = _r2['u']
        _r2['u_m'] = _r['u']
        del(_r2['u'])
        _r = _r2
        # print("[32m[%s] %s bought %s %s with %s %s from %s[m" % (
        #     datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        #     _r["u_t"], _r["b_r"], _r["a_r"], _r["b_p"], _r["a_p"], _r["u_m"]))
        try:
            self.db_op.insert(_r)
        except Exception as e:
            print('error', e)

    def handle_filled_o4(self, _id, _pay, _info, _u):
        _filter = {'id': _id, 't': 4, 'u': _u}
        _o_info = self.db_order.find_one(_filter)
        if not _o_info:
            print("error: %s" % _filter)
            return
        _b = _o_info['b'] - _pay['b']
        if self.is_zero(_b, _info['pays']['asset_id']):
            self.db_order.delete_one(_filter)
        else:
            self.db_order.update_one(_filter, {'$set': {'b': _b}}, True)

    def handle_filled_o7(self, _id, _pay, _info):
        # update order
        # update deferee
        _filter = {'id': _id, 't': 7}
        _o_info = self.db_order.find_one(_filter)
        if not _o_info:
            print("error: %s %s" % (_filter, _pay))
            return
        _b_s = _o_info['b_s'] - _pay['b']
        if self.is_zero(_b_s, _info['pays']['asset_id']):
            self.db_order.delete_one(_filter)
        else:
            _b_b = _o_info['b_b']*_b_s/_o_info['b_s']
            self.db_order.update_one(
                _filter, {'$set': {'b_s': _b_s, 'b_b': _b_b, 'd_f': 0}}, True)

    def handle_filled_o8(self, _u, _pay, _receive, _info):
        _filter = {'u': _u, 'a_c': _pay['a'], 'a_d': _receive['a']}
        _o_info = self.db_order.find_one(_filter)
        if not _o_info:
            # print("no debt: %s" % _filter)
            return
        _b_d = _o_info['b_d']-_receive['b']
        if self.is_zero(_b_d, _info['receives']['asset_id']):
            self.db_order.delete_one(_filter)
            return
        self.db_order.update_one(
            _filter,
            {'$inc': {'b_c': -_pay['b'], 'b_d': -_receive['b']}}, True)

    @asyncio.coroutine
    def handle_order(self, _info, _r):
        # orders 增加 order_id, sell, receive, deferred_fee,
        # balance_change 增加 block seller -fee
        _b_fee, _a_fee = yield from self.get_b(_info["fee"])
        _b_s, _a_s = yield from self.get_b(_info["amount_to_sell"])
        _b_b, _a_b = yield from self.get_b(_info["min_to_receive"])
        _o = {
            'b_s': _b_s, 'a_s': _a_s, 'id': id_to_int(_r['r']),
            'b_b': _b_b, 'a_b': _a_b, 't': 7, 'u': _r['u'], 'p': _b_b/_b_s}
        if _a_fee == "BTS":
            _o['d_f'] = _b_fee
        else:
            _info2 = yield from self.get_object(_info["fee"]["asset_id"])
            _info2 = _info2["options"]["core_exchange_rate"]
            _b_b, __ = yield from self.get_b(_info2['base'])
            _b_q, __ = yield from self.get_b(_info2['quote'])
            if _b_b != 0:
                _o['d_f'] = _b_fee * _b_q / _b_b
            else:
                _o['d_f'] = 0
        self.db_order.insert_one(_o)
        _r['a_s'] = _o['a_s']
        _r['a_b'] = _o['a_b']
        _r['b'] = _o['b_s']
        _r['p'] = _o['p']
        _r['u'] = _o['u']
        _r.pop('r')
        try:
            self.db_order_history.insert_one(_r)
        except Exception as e:
            print('error', e)

    @asyncio.coroutine
    def handle_cancel(self, _info, _r):
        # balance_change 增加 block seller -fee
        # balance_change 增加 block seller +deferred_fee
        # orders 删除 order_id
        _id = id_to_int(_info["order"])
        _filter = {'id': _id, 't': 7, 'u': _r['u']}
        _o = self.db_order.find_one(_filter)
        if _o:
            if _o['d_f']:
                self.add_b(_r['B'], _r['u'], 'BTS', _o['d_f'])
            _r['a_s'] = _o['a_s']
            _r['a_b'] = _o['a_b']
            _r['b'] = _o['b_s']
            _r['p'] = _o['p']
            _r['u'] = _o['u']
            if 'r' in _r:
                _r.pop('r')
            self.db_order_history.insert_one(_r)
        self.db_order.delete_one(_filter)

    @asyncio.coroutine
    def handle_settle(self, _info, _r):
        # balance_change 增加 -fee
        # orders 增加 type 4
        _r['b'], _r['a'] = yield from self.get_b(_info["amount"])

        # print("[31m[%s] %s settle %s %s[m" % (
        #     datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        #     _r["u"], _r["b"], _r["a"]))
        try:
            self.db_op.insert(_r)
        except Exception as e:
            print('error', e)

        # some settle order filled, see 1.11.400461
        if type(_r['r']) is dict:
            yield from self.handle_settle2(_r)
        else:
            _id = id_to_int(_r['r'])
            self.db_order.insert_one(
                {'id': _id, 't': 4, 'u': _r['u'], 'b': _r['b'], 'a': _r['a']})

    @asyncio.coroutine
    def handle_settle2(self, _r):
        # TODO, who have be settled?need change balance
        self.add_b(_r['B'], _r['u'], _r['a'], -_r['b'])
        _b_b, _a_b = yield from self.get_b(_r['r'])
        self.add_b(_r['B'], _r['u'], _a_b, _b_b)

    @asyncio.coroutine
    def handle_claim(self, _info, _r):
        # balance_change
        _r['u'] = yield from self.get_u(_info["deposit_to_account"])
        _b, _r['a'] = yield from self.get_b(_info["total_claimed"])
        self.add_b(_r['B'], _r['u'], _r['a'], _b)
        _id = _r.pop('id')
        self.db_op.update_one(
            _r, {'$inc': {'b': _b}, '$set': {"id": _id}}, True)

    @asyncio.coroutine
    def handle_issue(self, _info, _r):
        # balance_change
        _r['u_f'] = _r.pop('u')
        _r['u_t'] = yield from self.get_u(_info["issue_to_account"])
        _r['b'], _r['a'] = yield from self.get_b(_info["asset_to_issue"])
        self.add_b(_r['B'], _r['u_t'], _r['a'], _r['b'])

        # print("[31m[%s] %s issue %s %s to %s[m" % (
        #     datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        #     _r["u_f"], _r["b"], _r["a"], _r['u_t']))
        try:
            self.db_op.insert(_r)
        except Exception as e:
            print('error', e)

    @asyncio.coroutine
    def handle_fee(self, _info, _r):
        if _r['t'] not in self.u_key:
            return
        _r['u'] = yield from self.get_u(_info[self.u_key[_r['t']]])
        _b_fee, _a_fee = yield from self.get_b(_info["fee"])
        if self.is_zero(_b_fee, _info['fee']['asset_id']):
            return
        self.add_b(_r['B'], _r['u'], _a_fee, -_b_fee)

    @asyncio.coroutine
    def handle_burn(self, _info, _r):
        # burn asset
        _r['b'], _r['a'] = yield from self.get_b(_info["amount_to_reserve"])
        self.add_b(_r['B'], _r['u'], _r['a'], -_r['b'])
        try:
            self.db_op.insert(_r)
        except Exception as e:
            print('error', e)

    @asyncio.coroutine
    def handle_feepool(self, _info, _r):
        # fund fee pool
        _info["asset_id"] = '1.3.0'
        _r['b'], _r['a'] = yield from self.get_b(_info)
        self.add_b(_r['B'], _r['u'], _r['a'], -_r['b'])
        try:
            self.db_op.insert(_r)
        except Exception as e:
            print('error', e)

    @asyncio.coroutine
    def handle_vesting(self, _info, _r):
        # withdraw vesting balance
        _r['b'], _r['a'] = yield from self.get_b(_info["amount"])
        self.add_b(_r['B'], _r['u'], _r['a'], _r['b'])
        # print("[31m[%s] %s withdraw %s %s from vesting[m" % (
        #     datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        #     _r["u"], _r["b"], _r["a"]))
        try:
            self.db_op.insert(_r)
        except Exception as e:
            print('error', e)

    @asyncio.coroutine
    def handle_toblind(self, _info, _r):
        # sent to blind address
        _r['b'], _r['a'] = yield from self.get_b(_info["amount"])
        self.add_b(_r['B'], _r['u'], _r['a'], -_r['b'])
        try:
            self.db_op.insert(_r)
        except Exception as e:
            print('error', e)

    @asyncio.coroutine
    def handle_fromblind(self, _info, _r):
        # get from blind address
        _r['u'] = yield from self.get_u(_info['to'])
        _r['b'], _r['a'] = yield from self.get_b(_info["amount"])
        self.add_b(_r['B'], _r['u'], _r['a'], _r['b'])
        try:
            self.db_op.insert(_r)
        except Exception as e:
            print('error', e)

    @asyncio.coroutine
    def handle_cancelsettle(self, _info, _r):
        # cancel settle order
        _id = id_to_int(_info["settlement"])
        self.db_order.delete_one({'id': _id, 't': 4})

    @asyncio.coroutine
    def handle_feeclaim(self, _info, _r):
        # fee claim
        _r['b'], _r['a'] = yield from self.get_b(_info["amount_to_claim"])
        self.add_b(_r['B'], _r['u'], _r['a'], _r['b'])
        try:
            self.db_op.insert(_r)
        except Exception as e:
            print('error', e)
