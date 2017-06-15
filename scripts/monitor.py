#!/usr/bin/env python3

from bts.ws.base_protocol import BaseProtocol
import sys
import json
from misc import id_to_int, next_id
from monitor_help import MonitorHelper
import signal

try:
    import asyncio
except ImportError:
    import trollius as asyncio


class Monitor(BaseProtocol):
    op_id_begin = None
    helper = None
    lock = asyncio.Lock()

    @asyncio.coroutine
    def handle_operation(self, notify):
        if self.helper:
            yield from self.helper.handle_operation(notify)

    def onOperation(self, notify):
        asyncio.async(self._onOperation(notify))

    @asyncio.coroutine
    def _onOperation(self, notify):
        yield from self.lock
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        op_id_cur = notify["id"]
        if self.op_id_begin is None:
            self.op_id_begin = op_id_cur
        op_id_begin = self.op_id_begin
        if id_to_int(op_id_begin) > id_to_int(op_id_cur):
            self.lock.release()
            signal.signal(signal.SIGINT, signal.SIG_DFL)
            return
        for _i in range(id_to_int(op_id_begin), id_to_int(op_id_cur)):
            response = yield from self.rpc(
                [self.database_api, "get_objects", [["1.11.%s" % _i]]])
            _notify = response[0]
            yield from self.handle_operation(_notify)
        yield from self.handle_operation(notify)
        self.op_id_begin = next_id(op_id_cur)
        self.helper.save_begin_op(self.op_id_begin, notify['block_num']-1)
        signal.signal(signal.SIGINT, signal.SIG_DFL)
        self.lock.release()

    def onGlobalProperties(self, notify):
        self.helper.handle_gp(notify)

    @asyncio.coroutine
    def onOpen(self):
        yield from super().onOpen()
        self.helper.init_p(self)
        self.subscribe("1.11.", self.onOperation)
        self.subscribe("2.1.0", self.onGlobalProperties)


if __name__ == '__main__':

    config = json.load(open(sys.argv[1]))

    ws = Monitor(config["api_server"])
    helper = MonitorHelper(config['mongo'])
    ws.helper = helper
    asyncio.get_event_loop().run_until_complete(ws.handler())
