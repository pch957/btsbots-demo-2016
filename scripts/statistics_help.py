#!/usr/bin/env python3

# from pprint import pprint
import pymongo


class StatisticsHelper(object):
    def __init__(self, config):
        self.trusted_asset = ["CNY", 'USD', 'OPEN.BTC', 'BTS']
        self.is_sync = False
        self.last_block = 0
        self.connect_db(config)
        self.l_a = []
        self.price = {}
        self.need_update_price = True
        if not self.need_update_price:
            self.l_a = [
                "OPEN.ETH", "OPEN.DASH", "OPEN.MAID", "OPEN.STEEM", "OPEN.OMNI", "OPEN.LTC",
                "OPEN.LISK", "OPEN.DOGE", "OPEN.GRC"]

    def isz(self, b):
        return b < 0.000000001

    def connect_db(self, _config):
        _client = pymongo.MongoClient(_config['host'], _config['port'])
        _db = _client[_config['db']]
        self.db_op = _db["op"]
        self.db_price = _db["price"]
        self.db_gp = _db["global_properties"]
        self.db_bc = _db["balance_change"]
        self.db_balance = _db["balance"]
        self.db_volume_m_1 = _db["volume_m_1"]
        self.db_volume_a_1 = _db["volume_a_1"]
        self.db_volume_u_1 = _db["volume_u_1"]
        self.db_volume_u_28 = _db["volume_u_28"]
        self.db_vb_u_28 = _db["vb_u_28"]
        self.db_vb_u_1 = _db["vb_u_1"]

    def init_price(self):
        for _e in self.db_price.find({}):
            if "p" not in _e:
                continue
            self.price[_e["a"]] = _e["p"]

    def update_price(self, _asset, _price):
        self.price[_asset] = _price
        if self.need_update_price or _asset not in self.l_a:
            print("%s price is %s" % (_asset, _price))
            self.db_price.update_one(
                {"a": _asset}, {"$set": {"p": _price}}, True)

    def check_op_sync(self, _b, _block):
        if _b < _block-2:
            return
        self.is_sync = True

    def run(self, _block):
        _e = self.db_gp.find_one({})
        if 'safe_B' not in _e:
            return
        _b = _e['safe_B']
        if not self.is_sync:
            self.check_op_sync(_b, _block)
            return
        # self.s_balance(self.last_block, _block)
        self.s_op(_b)
        if(self.last_block == 0 or _block % (3*60/3) == 0):
            self.compute_price()
        if(self.last_block == 0 or _block % (30*60/3) == 20):
            self.vb_u_update(self.db_volume_u_28, self.db_vb_u_28)
            self.vb_u_update(self.db_volume_u_1, self.db_vb_u_1)
        self.last_block = _b

    def s_balance(self, _bs, _be):
        if not _bs:
            _e = self.db_gp.find_one({})
            if not _e or 'B_b' not in _e:
                return
            _bs = _e['B_b']

        for _e in self.db_bc.find({"B": {"$gt": _bs, "$lte": _be}}):
            self.db_balance.update_one(
                {'u': _e['u'], 'a': _e['a']}, {'$inc': {'b': _e['b']}}, True)
            # print("add %s's balance %s %s" % (_e['u'], _e['b'], _e['a']))
        self.db_gp.update_one({}, {'$set': {'B_b': _be}}, True)

    def minus(self, _ops):
        for _e in _ops:
            _e["b_p"] *= -1
            _e["b_r"] *= -1

    def s_op(self, _b):
        _d_1 = int(24*60*60/3)
        _d_28 = int(28*24*60*60/3)
        _bs = self.last_block
        if not _bs:
            self.db_volume_m_1.remove({})
            self.db_volume_a_1.remove({})
            self.db_volume_u_1.remove({})
            self.db_volume_u_28.remove({})
            list1 = list(self.db_op.find(
                {"B": {"$gt": _b-_d_1, "$lte": _b}, "t": 4}))
            list28 = list(self.db_op.find(
                {"B": {"$gt": _b-_d_28, "$lte": _b}, "t": 4}))
        else:
            if _b == _bs:
                return
            _ops_a = list(self.db_op.find(
                {"B": {"$gt": _bs, "$lte": _b}, "t": 4}))
            _ops_s_1 = list(self.db_op.find(
                {"B": {"$gt": _bs-_d_1, "$lte": _b-_d_1}, "t": 4}))
            _ops_s_28 = list(self.db_op.find(
                {"B": {"$gt": _bs-_d_28, "$lte": _b-_d_28}, "t": 4}))
            self.minus(_ops_s_1)
            self.minus(_ops_s_28)
            list1 = _ops_a + _ops_s_1
            list28 = _ops_a + _ops_s_28
        self.volume_m_compute(list1, self.db_volume_m_1)
        self.volume_a_compute(list1, self.db_volume_a_1)
        self.volume_u_compute(list1, self.db_volume_u_1)
        self.volume_u_compute(list28, self.db_volume_u_28)

    def _a_price(self, _v, _b1, _a1, _b2, _a2):
        if _a2 not in _v:
            _v[_a2] = [0.0, 0.0]
        _v[_a2][0] += _b1 * self.price[_a1]
        _v[_a2][1] += _b2
        # if _a2 == "OBITS":
        #     print(_b1, _a1, _b2, _a2, )
        #     print(_v[_a2])

    def is_trusted_asset(self, a):
        if a in self.price and a in self.trusted_asset:
            return True
        else:
            return False

    def compute_price(self):
        #
        pass

    def volume_m_compute(self, _ops, _db):
        _v = {}
        for _e in _ops:
            _key = tuple(sorted([_e["a_p"], _e["a_r"]]))
            if _key not in _v:
                _v[_key] = {_e["a_p"]: 0.0, _e["a_r"]: 0.0}
            _v[_key][_e["a_p"]] += _e['b_p']
            _v[_key][_e["a_r"]] += _e['b_r']

        for _key in _v:
            _filter = {"a": [_key[0], _key[1]]}
            _b = [0.0, 0.0]
            _e = _db.find_one(_filter)
            if _e:
                _b = _e['b']
            _b[0] += _v[_key][_key[0]]
            _b[1] += _v[_key][_key[1]]
            if self.isz(_b[0]) or self.isz(_b[1]):
                _db.remove(_filter)
                continue
            _db.update_one(
                _filter, {"$set": {'b': _b}}, True)

    def volume_a_compute(self, _ops, _db):
        _v = {}
        for _e in _ops:
            if _e['a_p'] not in _v:
                _v[_e['a_p']] = 0.0
            if _e['a_r'] not in _v:
                _v[_e['a_r']] = 0.0
            _v[_e['a_p']] += _e['b_p']
            _v[_e['a_r']] += _e['b_r']

        for _key in _v:
            if _v[_key] == 0.0:
                continue
            _filter = {"a": _key}
            _e = _db.find_one(_filter)
            _b = {'b': 0.0, 'v': 0.0}
            if _e:
                _b['b'] = _e['b']
            _b['b'] += _v[_key]
            if self.isz(_b['b']):
                _db.remove(_filter)
                continue
            if _key in self.price:
                _b['v'] = _b['b']*self.price[_key]
            _db.update_one(_filter, {"$set": _b}, True)

    def vu_helper(self, _v, _u, _a, _b1, _b2):
        _key = (_u, _a)
        if _key not in _v:
            _v[_key] = [0.0, 0.0]
        _v[_key][0] += _b1
        _v[_key][1] += _b2

    def volume_u_compute(self, _ops, _db):
        _v = {}
        for _e in _ops:
            if _e["a_p"] not in self.price or _e["a_r"] not in self.price:
                continue
            self.vu_helper(_v, _e['u_t'], _e['a_p'], _e['b_p'], -_e['b_p'])
            self.vu_helper(_v, _e['u_t'], _e['a_r'], _e['b_r'], _e['b_r'])
            self.vu_helper(_v, _e['u_m'], _e['a_p'], _e['b_p'], _e['b_p'])
            self.vu_helper(_v, _e['u_m'], _e['a_r'], _e['b_r'], -_e['b_r'])
        for _key in _v:
            _b = {'b': 0.0, 'v': 0.0}
            _filter = {"u": _key[0], "a": _key[1]}
            _e = _db.find_one(_filter)
            if _e:
                _b = {'b': _e['b'], 'v': _e['v']}
            _b["v"] += _v[_key][0]
            _b["b"] += _v[_key][1]
            if self.isz(_b["v"]):
                _db.remove(_filter)
            _db.update_one(_filter, {"$set": _b}, True)

    def vb_u_update(self, _db1, _db2):
        _v = {}
        _list1 = []
        _list2 = []
        for _e in _db1.find({}):
            if _e["a"] not in self.price:
                continue
            if _e["u"] not in _v:
                _v[_e["u"]] = [0.0, 0.0]
            _v[_e["u"]][0] += self.price[_e["a"]]*_e["v"]
            _v[_e["u"]][1] += self.price[_e["a"]]*_e["b"]
        for _key in _v:
            _list1.append({"t": 0, "u": _key, "v": _v[_key][0]})
            _list2.append({"t": 1, "u": _key, "v": _v[_key][1]})
        _list3 = sorted(_list1, key=lambda k: k['v'])
        _list4 = sorted(_list2, key=lambda k: k['v'])
        _db2.remove({})
        for _e in _list3[-10:] + _list4[:5] + _list4[-5:]:
            _db2.insert(_e)
