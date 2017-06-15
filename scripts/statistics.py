#!/usr/bin/env python3

# from pprint import pprint
from bts.ws.base_protocol import BaseProtocol
import sys
import json
from statistics_help import StatisticsHelper
# import signal

try:
    import asyncio
except ImportError:
    import trollius as asyncio


class Statistics(BaseProtocol):
    helper = None
    object_info = {}

    asset_list = [
        "CNY", "BTC", "SILVER", "GOLD", "TRY", "SGD", "HKD", "NZD", "MXN",
        "CAD", "CHF", "AUD", "GBP", "JPY", "EUR", "USD", "KRW", "TUSD",
        "ARS"]
    alias = {
        "BTC": ["OPEN.BTC", "TRADE.BTC"], "USD": ["OPEN.USD", "OPEN.USDT"],
        "EUR": ["OPEN.EUR"], "CNY": ["OPEN.CNY"], "RUB": ["RUBLE"]}
    price = {"CNY": 1.0}

    def init_helper(self, helper):
        _asset_list = Statistics.asset_list+["BTS"]
        for _a in Statistics.alias:
            _asset_list += Statistics.alias[_a]
        helper.l_a += _asset_list
        helper.price = Statistics.price
        self.helper = helper

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
    def init_price(self):
        self.helper.init_price()

        for _a in self.alias["CNY"] + ["CNY"]:
            self.helper.update_price(_a, 1.0)

        _bitasset_data_id = []
        response = yield from self.rpc(
            [self.database_api, "lookup_asset_symbols", [self.asset_list]])
        for _info in response:
            _bitasset_data_id.append(_info["bitasset_data_id"])
        response = yield from self.rpc(
                [self.database_api, "get_objects", [_bitasset_data_id]])
        for _info in response:
            yield from self.handle_feed(
                _info["current_feed"]["settlement_price"])

    @asyncio.coroutine
    def handle_feed(self, _feed_price):
        _b_q, _a_q = yield from self.get_b(_feed_price['quote'])
        _b_b, _a_b = yield from self.get_b(_feed_price['base'])
        if(_b_q) == 0:
            return
        feed_price = _b_b/_b_q  # CNY/BTS
        if _a_b == "CNY":
            self.helper.update_price('BTS', feed_price)
        else:
            _p = self.price['BTS']/feed_price
            self.helper.update_price(_a_b, _p)
            if _a_b in self.alias:
                for _a in self.alias[_a_b]:
                    self.helper.update_price(_a, _p)

    @asyncio.coroutine
    def handle_op_feeds(self, notify):
        _info = notify["op"][1]
        if _info["publisher"] != "1.2.9952":
            return
        _info = _info["feed"]["settlement_price"]
        yield from self.handle_feed(_info)

    def onOperation(self, notify):
        if not notify:
            return
        if notify["op"][0] != 19:
            return
        asyncio.async(self.handle_op_feeds(notify))

    def onGlobalProperties(self, notify):
        # signal.signal(signal.SIGINT, signal.SIG_IGN)
        self.helper.run(notify["head_block_number"])
        # signal.signal(signal.SIGINT, signal.SIG_DFL)

    @asyncio.coroutine
    def onOpen(self):
        yield from super().onOpen()
        yield from self.init_price()
        self.subscribe("1.11.", self.onOperation)
        self.subscribe("2.1.0", self.onGlobalProperties)


if __name__ == '__main__':

    config = json.load(open(sys.argv[1]))

    ws = Statistics(config["api_server"])
    helper = StatisticsHelper(config['mongo'])
    ws.init_helper(helper)
    asyncio.get_event_loop().run_until_complete(ws.handler())
