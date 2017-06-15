#!/usr/bin/env python3

from bts.ws.base_protocol import BaseProtocol
import sys
import json
from misc import id_to_int
import pymongo
import signal

try:
    import asyncio
except ImportError:
    import trollius as asyncio


D_ID = '1.8.260'  # 1.8.2590
B_ID = '2.5.424'  # 2.5.42388


class CorrectBalance(BaseProtocol):
    object_info = {}

    def connect_db(self, _config):
        _client = pymongo.MongoClient(_config['host'], _config['port'])
        _db = _client[_config['db']]

        self.db_order = _db["order"]
        self.db_balance = _db["balance"]
        self.db_gp = _db["global_properties"]

        self.db_order.remove({'t': 8})
        self.db_balance.remove({})

    @asyncio.coroutine
    def get_object(self, _id):
        if _id not in self.object_info:
            response = yield from self.rpc(
                [self.database_api, "get_objects", [[_id]]])
            self.object_info[_id] = response[0]
        return self.object_info[_id]

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

    def is_zero(self, _b, _a_id):
        return _b*(10**self.object_info[_a_id]["precision"]) < 0.1

    @asyncio.coroutine
    def onOpen(self):
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        yield from super().onOpen()
        yield from self.update_gp()
        yield from self.update_o()
        yield from self.update_b()
        self.add_b_from_o()
        signal.signal(signal.SIGINT, signal.SIG_DFL)

    @asyncio.coroutine
    def update_gp(self):
        _gp = yield from self.get_object('2.1.0')
        self.db_gp.update_one(
                {}, {'$set': {'B_b': _gp['head_block_number']}},
                True)

    @asyncio.coroutine
    def update_o(self):
        for i in range(0, id_to_int(D_ID)+1):
            _e = yield from self.get_object('1.8.%s' % i)
            if _e:
                yield from self._update_o(_e)

    @asyncio.coroutine
    def _update_o(self, _e):
        u = yield from self.get_u(_e['borrower'])
        _e['call_price']['base']['amount'] = _e['collateral']
        b_c, a_c = yield from self.get_b(_e['call_price']['base'])
        _e['call_price']['quote']['amount'] = _e['debt']
        b_d, a_d = yield from self.get_b(_e['call_price']['quote'])
        self.db_order.insert_one(
            {'t': 8, 'u': u, 'a_c': a_c, 'b_c': b_c, 'a_d': a_d, 'b_d': b_d})

    @asyncio.coroutine
    def update_b(self):
        for i in range(0, id_to_int(B_ID)+1):
            _e = yield from self.get_object('2.5.%s' % i)
            if _e:
                yield from self._update_b(_e)

    @asyncio.coroutine
    def _update_b(self, _e):
        b_i = {'amount': _e['balance'], 'asset_id': _e['asset_type']}
        b, a = yield from self.get_b(b_i)
        if self.is_zero(b, _e['asset_type']):
            return
        u = yield from self.get_u(_e['owner'])
        self.db_balance.update_one({'u': u, 'a': a}, {'$inc': {'b': b}}, True)

    def add_b_from_o(self):
        _l = self.db_order.find({})
        for _e in _l:
            if _e['t'] == 4:
                self.add_o4(_e)
            elif _e['t'] == 7:
                self.add_o7(_e)
            else:
                self.add_o8(_e)

    def add_o4(self, _e):
        self.db_balance.update_one(
                {'u': _e['u'], 'a': _e['a']},
                {'$inc': {'b': _e['b']}}, True)

    def add_o7(self, _e):
        self.db_balance.update_one(
                {'u': _e['u'], 'a': _e['a_s']},
                {'$inc': {'b': _e['b_s']}}, True)

    def add_o8(self, _e):
        self.db_balance.update_one(
                {'u': _e['u'], 'a': _e['a_c']},
                {'$inc': {'b': _e['b_c']}}, True)
        self.db_balance.update_one(
                {'u': _e['u'], 'a': _e['a_d']},
                {'$inc': {'b': -_e['b_d']}}, True)


if __name__ == '__main__':

    config = json.load(open(sys.argv[1]))

    ws = CorrectBalance(config["api_server"])
    ws.connect_db(config['mongo'])
    asyncio.get_event_loop().run_until_complete(ws.handler())
