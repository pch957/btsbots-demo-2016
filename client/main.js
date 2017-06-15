import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
var AsyncLock = require('async-lock');
var lock = new AsyncLock();

import './main.html';
block_sync_info = {"T":0, "B":0, 'id':"", "syncTime": -1};
account_list = [];
user_info = {"name": null};
var ITEMS_INC=20;
var URL={'P':'/', 'p':{}};
b_debug = false;
balance_sync = true;
chats_limit = 100;
g_price = {};
vb_days = 28;

db_op = new Meteor.Collection("op");
db_order_history = new Meteor.Collection("order_history");
db_global_properties = new Meteor.Collection("global_properties");
db_price = new Meteor.Collection("price");
db_vb_u_28 = new Meteor.Collection("vb_u_28");
db_vb_u_1 = new Meteor.Collection("vb_u_1");
db_volume_m_1 = new Meteor.Collection("volume_m_1");
db_volume_a_1 = new Meteor.Collection("volume_a_1");
db_volume_u_1 = new Meteor.Collection("volume_u_1");
db_volume_u_28 = new Meteor.Collection("volume_u_28");
db_balance = new Meteor.Collection("balance");
db_order = new Meteor.Collection("order");
db_arbit = new Meteor.Collection("arbitrage");
db_asset_blacklist = new Meteor.Collection("asset_blacklist");
Chats = new Meteor.Collection("chats");

asset_blacklist = []
var n_limit = 10;

var set_limit = function(n) {
    if(n>100)
        n = 100;
    n_limit = n;
    Session.set("limit", n);
}

change_limit = function() {
    if(n_limit == 10)
        set_limit(100);
    else
        set_limit(10);

}

var react_price = function(a) {
    info = db_price.findOne({"a":a});
    if(info) return info["p"];
    else return 0.0;
}

var fast_price = function(a) {
    if(a in g_price)
        return g_price[a];
    return 0.0;
}

var by = function(name,minor){
    return function(o,p){
        var a,b;
        if(o && p && typeof o === 'object' && typeof p ==='object'){
            a = o[name];
            b = p[name];
            if(a === b){
                return typeof minor === 'function' ? minor(o,p):0;
            }
            if(typeof a === typeof b){
                return a <b ? -1:1;
            }
            return typeof a < typeof b ? -1 : 1;
        }else{
            thro("error");
        }
    }
}

var toFixed2 = function(_p, n) {
    if(!_p)
        return;
    _b = 9-Math.floor((Math.log10(_p*Math.pow(10,9))))+n-1;
    if (_b < 1)
        _b = 1;
    return _p.toFixed(_b);
}

var formatPrice = function(type, _p) {
    if(!_p)
        return;
    _b = 9-Math.floor((Math.log10(_p*Math.pow(10,9))))+3;
    if (_b < 1)
        _b = 1;
    if(type=="buy")
        p = Math.ceil(_p*Math.pow(10,_b))/Math.pow(10,_b);
    else
        p = Math.floor(_p*Math.pow(10,_b))/Math.pow(10,_b);
    return p.toFixed(_b);
}

var formatFloat = function(_p, n) {
    if(!_p)
        return;
    _b = 9-Math.floor((Math.log10(_p*Math.pow(10,9))))+n;
    if (_b < 1)
        _b = 1;
    p = Math.floor(_p*Math.pow(10,_b))/Math.pow(10,_b);
    return p.toFixed(_b);
}

var format_time = function(time) {
    var M = time.getMonth()+1;
    if (M < 10)
        M = '0' + M;
    var d = time.getDate();
    if (d < 10)
        d = '0' + d;
    var h = time.getHours();
    if (h < 10)
        h = '0' + h;
    var m = time.getMinutes();
    if (m < 10)
        m = '0' + m;
    var s = time.getSeconds();
    if (s < 10)
        s = '0' + s;
    return M+'/'+d+' '+h+':'+m+':'+s;
}

isSync = function(){
    // TODO confirm all ops have handled
    var tNow = Math.floor(Date.now()/1000);
    // console.log(block_sync_info, tNow);
    return tNow - block_sync_info["T"] < 10;
}

Template.registerHelper("format_time", function (time) {
    return format_time(time);
});

Template.registerHelper("format_price", function (type, _p) {
    return formatPrice(type, _p);
});

Template.registerHelper("format_float", function (_p, n) {
    return formatFloat(_p, n);
});

Template.registerHelper("get_asset_symbol", function () {
    return Session.get("keyword");
});
Template.registerHelper("equals", function (a, b) {
    return (a == b);
});
Template.registerHelper("toFixed2", function (a, b) {
    if(!a)
        return;
    return a.toFixed(b);
});
Template.registerHelper("price", function (a) {
    return react_price(a);
});
Template.registerHelper("price2", function (a, b) {
    _p = react_price(b)/react_price(a);
    return toFixed2(_p, 3);
});
Template.registerHelper("price_ready", function () {
    return handle_price.ready();
});
Template.registerHelper("style", function (a) {
    if (a == Session.get("keyword"))
        //return("color:inherit;font-weight:bold");
        return("color:default;font-weight:bold");
    else
        return("color:inherit");
});

Template.registerHelper("block_date", function (block) {
    _timestamp = block_sync_info["T"] - (block_sync_info["B"] - block)*3;
    return new Date(_timestamp*1000);
});

Template.App_body.helpers({
    title: function(){
        return Session.get("title");
    },
    fav: function(){
        return Session.get("fav");
    }
});

Template.nav.helpers({
    isBotsEnable: function(){
        if(sessionStorage.enableBots)
            return "checked";
        else
            return "";
    },
    user_lists: function(){
        var default_lists=[];
        var favU=Session.get('favU');
        for(var index in favU){
            if (favU[index]!=user_info['name'])
                default_lists.push({'u': favU[index]})
        }
        return default_lists;
    },
    asset_lists: function(){
        var default_lists=[];
        var favA=Session.get('favA');
        for(var index in favA){
            default_lists.push({'a': favA[index]})
        }
        return default_lists;
    },
    market_lists: function(){
        var default_lists=[];
        var favM=Session.get('favM');
        for(var index in favM){
            [a1, a2] = favM[index].split('_');
            default_lists.push({'a1': a1, 'a2': a2})
        }
        return default_lists;
    },
    getTotalVolume: function(){
        var volume=0.0;
        db_volume_a_1.find({}).forEach(function(e){volume+=e.v});
        return volume;
    },
    getSyncInfo: function() {
        var sync_info = Session.get("block_sync_info");
        if(sync_info){
            var _date = new Date(sync_info["T"]*1000);
            var str_sync_info = TAPi18n.__('Block')+": "+sync_info["B"]+" "+format_time(_date);
            return str_sync_info;
        } else return "";
    }
});

Template.main_page.helpers({
    a_volume: function(){
        Session.get("limit");
        return db_volume_a_1.find({}, {sort:{v:-1}, limit:n_limit})},
    u_volumes_1: function(){
        var ret_list = [];
        var _map = {};

        db_volume_u_1.find({}).forEach(function(e){
            if (!(e.u in _map))
                _map[e.u] = 0.0;
            _map[e.u] += e.v*fast_price(e.a);
        });
        for(var u in _map){
            ret_list.push({"u":u, "v":_map[u]});
        }
        Session.get("limit");
        return ret_list.sort(by('v')).reverse().slice(0,n_limit);
    },
    u_volumes_28: function(){
        if(vb_days==28)
            return db_vb_u_28.find({"t":0}, {sort:{v:-1}})
        else
            return db_vb_u_1.find({"t":0}, {sort:{v:-1}})
    },
    u_profits_28: function(){
        if(vb_days==28)
            return db_vb_u_28.find({"t":1}, {sort:{v:-1}})
        else
            return db_vb_u_1.find({"t":1}, {sort:{v:-1}})
    }

});

Template.user_page_b.helpers({
    total: function(lists){
        var total_balance = 0.0;
        for(var index in lists){
            total_balance+=lists[index].v;
        }
        return total_balance;
    }
});

Template.user_page_av.helpers({
    total: function(lists){
        var total_balance = 0.0;
        for(var index in lists){
            total_balance+=lists[index].value;
        }
        return total_balance;
    }
});

Template.user_page.helpers({
    list_balance: function(){
        var ret_list = [];
        //var user=URL['p']['_id'];
        var user=Session.get("keyword");
        db_balance.find({'u': user}).forEach(function(e){
            e.v= e.b*react_price(e.a);
            if (Math.abs(e.v) > 0.1)
                ret_list.push(e);
        });
        return ret_list.sort(by('v')).reverse();
    },
    a_volume_1: function(){
        var ret_list = [];
        var account = FlowRouter.getParam("_id");
        if (! account)
            account = user_info['name'];
        db_volume_u_1.find({u:account}).forEach(function(e){
            e.value = e.v*react_price(e.a);
            if (e.value > 1.0)
                ret_list.push(e);
        });
        return ret_list.sort(by('value')).reverse();
    },
    a_volume_28: function(){
        var ret_list = [];
        var account = FlowRouter.getParam("_id");
        if (! account)
            account = user_info['name'];
        db_volume_u_28.find({u:account}).forEach(function(e){
            e.value = e.v*react_price(e.a);
            if (e.value > 10.0)
                ret_list.push(e);
        });
        return ret_list.sort(by('value')).reverse();
    },
    a_balance_28: function(){
        var ret_list = [];
        var account = FlowRouter.getParam("_id");
        if (! account)
            account = user_info['name'];
        let _db = db_volume_u_28;
        if(vb_days != 28)
            _db = db_volume_u_1;
        _db.find({u:account}).forEach(function(e){
            e.value = e.b*react_price(e.a);
            e.v = e.b;
            if (Math.abs(e.value) > 1.0)
                ret_list.push(e);
        });
        return ret_list.sort(by('value')).reverse();
    },
});

Template.trx_list_page.helpers({
    isMarket: function(){return(URL['P']=='m')},
    order_historys: function(){
        var ret_list = [];
        var a_base = "";
        var color = "inherit";
        if(URL['P']=='m')
            a_base = URL['p']['_id'].split('_')[1];
        else if(URL['P']=='a')
            a_base = URL['p']['_id'];
        db_order_history.find({}, {sort: {id:-1}, limit:100}).forEach(function(e){
            if(e['a_b'] == a_base){
                color = "green";
                ret_list.push({
                    'B': e['B'], 't': e['t'], 'u': e['u'], 'a_b': e['a_b'], 'a_q': e['a_s'],
                    'c': color, 'p': 1/e['p'], 'b_b': e['b']*e['p'], 'b_q': e['b'], 't2': 'buy'
                });
            }
            else{
                if(e['a_s'] == a_base)
                    color = "red";
                ret_list.push({
                    'B': e['B'], 't': e['t'], 'u': e['u'], 'a_b': e['a_s'], 'a_q': e['a_b'],
                    'c': color, 'p': e['p'], 'b_b': e['b'], 'b_q': e['b']*e['p'], 't2': 'sell'
                });
            }
        });
        return ret_list;
    },
    trx_lists: function(){return db_op.find(Session.get('s_trx_filter'), {sort: {id:-1}, limit: Session.get("s_trx_limit")})},
    trade_lists: function(){
        if(!URL['p']['_id'])
            return;
        var ret_list = [];
        var a_s = URL['p']['_id'].split('_')[1];
        db_op.find(Session.get('s_trx_filter'), {sort: {id:-1}, limit: Session.get("s_trx_limit")}).forEach(function(e){
            if(!e['b_p'])
                console.log(e);
            var _info = {'id': e['id']};
            var t;
            if(e['T'])
                _t = e['T'];
            else
                _t = block_sync_info["T"] - (block_sync_info["B"] - e['B'])*3;
            _info['T']=new Date(_t*1000);
            _info['u_t'] = e['u_t'];
            _info['u_m'] = e['u_m'];
            if(e['a_p'] == a_s){
                _info['t'] = 'sell';
                _info['b'] = e['b_p'];
                _info['p'] = e['b_r']/e['b_p'];
                _info['v'] = e['b_r'];
                _info['c'] = 'red';
            }else{
                _info['t'] = 'buy';
                _info['b'] = e['b_r'];
                _info['p'] = e['b_p']/e['b_r'];
                _info['v'] = e['b_p'];
                _info['c'] = 'green';
            }
            _info['b'] = _info['b'].toFixed(4);
            _info['v'] = _info['v'].toFixed(4);
            ret_list.push(_info);
        });
        return ret_list.sort(by('id')).reverse();
    },
    trx_more: function(){return !(db_op.find(Session.get('s_trx_filter')).count() < Session.get("s_trx_limit"))}
});

Template.asset_page.helpers({
    m_volume: function(){
        var ret_list = [];

        var asset = FlowRouter.getParam("_id");
        db_volume_m_1.find({"a.0":asset}).forEach(function(e){
            ret_list.push({"base": asset, "quote": e.a[1], "volume":e.b[0]});
        });
        db_volume_m_1.find({"a.1":asset}).forEach(function(e){
            ret_list.push({"base": asset, "quote": e.a[0], "volume":e.b[1]});
        });
        return ret_list.sort(by('volume')).reverse().slice(0,n_limit);
    },
    u_volume_1: function(){
        return db_volume_u_1.find({a:FlowRouter.getParam("_id")}, {sort:{v:-1}, limit:n_limit})},
    a_holder: function(){
        return db_balance.find({a:FlowRouter.getParam("_id")}, {sort:{b:-1}, limit:n_limit})},
    u_volume_28: function(){
        return db_volume_u_28.find({}, {sort:{v:-1}, limit:n_limit})}
});

Template.login_page.events({
    'submit #login-form': function(e, t){
        var user = t.find('#account').value;
        var password = t.find('#password').value;
        bts_login(user, password);
        return false;
    },
});

Template.order_book.events({
    'keyup #volume_sell, change #volume_sell, keyup #price_sell, change #price_sell': function(evt){
        $('#value_sell').val($('#volume_sell').val()*$('#price_sell').val());
    },
    'keyup #value_buy, change #value_buy, keyup #price_buy, change #price_buy': function(evt){
        $('#volume_buy').val($('#value_buy').val()/$('#price_buy').val());
    },
    'focus #mm_spread_sell, keyup #mm_spread_sell, change #mm_spread_sell': function(evt){
        var a=URL['p']['_id'].split('_');
        var price = toFixed2(ref_price(a[0], a[1])*(1+1.0*$('#mm_spread_sell').val()/100),4);
        //console.log("hello", URL['p']['_id'])
        $('#mm_spread_sell').attr('title', price).tooltip('fixTitle').tooltip('show');
    },
    'focus #mm_spread_buy, keyup #mm_spread_buy, change #mm_spread_buy': function(evt){
        var a=URL['p']['_id'].split('_');
        var price = toFixed2(ref_price(a[0], a[1])/(1+1.0*$('#mm_spread_buy').val()/100),4);
        $('#mm_spread_buy').attr('title', price).tooltip('fixTitle').tooltip('show');
    }
});

Template.chat_room.events({
    'click #sendMsg': function(e){
        _sendMessage();
    },
    'keyup #chat_msg': function(e) {
        if (e.type == "keyup" && e.which == 13) {
            _sendMessage();
        }
    }
});
Template.chat_room.helpers({
    messages: function() {
      return Chats.find({}, {sort: {ts: 1}});
    }
});
Template.chat_item.rendered = function() {
    $("#chat_box").scrollTop($('#chat_box').prop("scrollHeight"));
};

_sendMessage = function() {
    var el = document.getElementById("chat_msg");
    if(el.value != "")
        Meteor.call('chat_msg', el.value);
    el.value = "";
    el.focus();
};

Template.order_book.helpers({
    mm_config: function(type, key){
        var a_b, a_s;
        var _config;
        if(type == 'buy')
            [a_s, a_b] = URL['p']['_id'].split('_');
        else
            [a_b, a_s] = URL['p']['_id'].split('_');
        if(!(a_s in bots_config) || !(a_b in bots_config[a_s]))
            return "";
        _config = bots_config[a_s][a_b];
        if(key in _config)
            return _config[key];
        return "";
    },
    isMine: function(u){
        if(u==user_info['name'])
            return true;
        else
            return false;
    },
    getAsset: function(type){
        var a=URL['p']['_id'].split('_');
        return a[type];
    },
    ref_price: function(a1, a2){
        return toFixed2(ref_price(a1, a2), 3);
    },
    getBalance: function(type){
        if(!Meteor.userId())
            return;
        var a=URL['p']['_id'].split('_');
        if(type=="buy")
            asset = a[0];
        else
            asset = a[1];
        return _getBalance(user_info['name'], asset);
    }
});

_getBalance = function(user, asset, usable=true){
    var balance = 0.0;
    info = db_balance.findOne({"a":asset, 'u': user});
    if(info)
        balance += info['b'];
    if(!usable)
        return balance;
    db_order.find({a_s:asset, u:user}).forEach(function(e){
        balance -= e['b_s'];
    });
    db_order.find({a_c:asset, u:user}).forEach(function(e){
        balance -= e['b_c'];
    });
    db_order.find({a_d:asset, u:user}).forEach(function(e){
        balance += e['b_d'];
    });
    db_order.find({a:asset, u:user}).forEach(function(e){
        balance -= e['b'];
    });
    return balance;
}

get_special=function(type, quote, base){
    var abc = Session.get('update_market');
    var ret_list = [];
    var b_list = [];
    var a=URL['p']['_id'].split('_');
    var spread = 1.001;
    if(type == "sell"){
        var a_s = base;
        var a_b = quote;
        db_arbit.find({a_s:a_s, a_b:a_b}).forEach(function(e){
            var _price = e['p']*spread*e['fb'];
            var _order = {
                'b': e['b'].toFixed(4), 'v': (e['b']*_price).toFixed(4),
                'u': '_special', 'p': _price, 'total': (e['b']*_price).toFixed(4)};
            if(b_list.indexOf(e['b'])<0){
                ret_list.push(_order);
                b_list.push(e['b']);
            }
        });
        return ret_list.sort(by('p'));
    }else{
        var a_s = quote;
        var a_b = base;
        db_arbit.find({a_s:a_s, a_b:a_b}).forEach(function(e){
            var _price = e['p']*spread*e['fb'];
            var _order = {
                'b': (e['b']*_price).toFixed(4), 'v': e['b'].toFixed(4),
                'u': '_special', 'p': 1/_price, 'total': (e['b']*_price).toFixed(4)};
            if(b_list.indexOf(e['b'])<0){
                ret_list.push(_order);
                b_list.push(e['b']);
            }
        });
        return ret_list.sort(by('p')).reverse();
    }
}

Template.market_page.helpers({
    buy: function(){
        var abc = Session.get('update_market');
        var ret_list = [];
        var a=URL['p']['_id'].split('_');
        var special_list = get_special('buy', a[0], a[1]);
        var total_volume=0.0;
        var price1 = 0;
        db_order.find({a_s:a[0], a_b:a[1]}, {sort:{p:1}}).forEach(function(e){
            if(price1 == 0)
                price1 = e['p'];
            total_volume+=e['b_b'];
            var price = 1/e['p'];
            var _order = {
                'b': e['b_b'].toFixed(4), 'v': e['b_s'].toFixed(4),
                'u': e['u'], 'p': price, 'id': e['id'],
                'total': total_volume.toFixed(4)};
            if(e['p'] < 10.0*price1 || e['u']==user_info['name'])
                ret_list.push(_order);

            for(var n in special_list){
                if(price>special_list[n]['p']){
                    var total_special = special_list[n]['total']*special_list[n]['p'];
                    var total_order = total_volume*price;
                    if (total_order > total_special)
                        special_list.splice(n, 1);
                }
            }
        });
        return special_list.concat(ret_list);
    },
    sell: function(){
        var abc = Session.get('update_market');
        var ret_list = [];
        var a=URL['p']['_id'].split('_');
        var special_list = get_special('sell', a[0], a[1]);
        var total_volume=0.0;
        var price1 = 0;
        db_order.find({a_s:a[1], a_b:a[0]}, {sort:{p:1}}).forEach(function(e){
            if(price1 == 0)
                price1 = e['p'];
            total_volume+=e['b_b'];
            var price = e['p'];
            var _order = {
                'b': e['b_s'].toFixed(4), 'v': e['b_b'].toFixed(4),
                'u': e['u'], 'p': e['p'], 'id': e['id'],
                'total': total_volume.toFixed(4)};
            if(e['p'] < 10.0*price1 || e['u']==user_info['name'])
                ret_list.push(_order);
            for(var n in special_list){
                if(price<special_list[n]['p']){
                    var total_special = special_list[n]['total']/special_list[n]['p'];
                    var total_order = total_volume/price;
                    if (total_order > total_special)
                        special_list.splice(n, 1);
                }
            }
        });
        return special_list.concat(ret_list);
    }
});

Template.opsItem.helpers({
    opType: function(type) {
        switch (type) {
            case 0: return Template.opTransfer;
            case 3: return Template.opDebt;
            case 4: return Template.opTransaction;
            default: return Template.opTransfer;
        }
    }
});
Template.opTransaction.helpers({
    trade_style: function(asset){
        if(URL['P']=='a'){
            if (asset==URL['p']['_id'])
                return("color:red");
            else
                return("color:green");
        } else
            return("");
    }
});
Template.opTrade.helpers({
    isBuy: function(asset){return(asset==URL['p']['_id'].split('_')[1])}
});

Template.exchange_page.helpers({
    asset_list: function(){
        var ret_list = [];
        var ret_dict = {};
        db_arbit.find({'a_s': "BTS"}).forEach(function(e){
            if(!(e['a_b'] in ret_dict))
                ret_dict[e['a_b']] = {'a':e['a_b'], 'b': 10.0};
            ret_dict[e['a_b']]['p_b1'] = 1/e['p'];
        });
        db_arbit.find({'a_b': "BTS"}).forEach(function(e){
            ret_dict[e['a_s']]['p_s1'] = e['p'];
        });
        db_arbit.find({'a_s': "OPEN.BTC"}).forEach(function(e){
            if(!(e['a_b'] in ret_dict))
                ret_dict[e['a_b']] = {'a':e['a_b'], 'b': 10.0};
            ret_dict[e['a_b']]['p_b2'] = 1/e['p'];
        });
        db_arbit.find({'a_b': "OPEN.BTC"}).forEach(function(e){
            ret_dict[e['a_s']]['p_s2'] = e['p'];
        });
        ret_dict['BTS']['p_b1'] = ret_dict['BTS']['p_s1'] = 1.0;
        ret_dict['OPEN.BTC']['p_b2'] = ret_dict['OPEN.BTC']['p_s2'] = 1.0;
        for(var asset in ret_dict)
            ret_list.push(ret_dict[asset]);
        return ret_list.sort(by('a'));
    }
});

Template.bots_limit_panel.helpers({
    bots_limit_list: function(){
        Session.get('bots_config');
        var ret_list = [];
        var asset_list = [];
        for(var a_s in bots_config){
            if(asset_list.indexOf(a_s)<0)
                asset_list.push(a_s);
            for(var a_b in bots_config[a_s]){
                if(asset_list.indexOf(a_b)<0)
                    asset_list.push(a_b);
            }
        }
        for(var a in bots_limit){
            ret_list.push({"a":a, "b":bots_limit[a]});
        }
        for(var index in asset_list){
            a2 = asset_list[index];
            if(!(a2 in bots_limit))
                ret_list.push({"a":a2, "b":""});
        }
        return ret_list.sort(by('a'));
    }
});

Template.local_price_panel.helpers({
    local_price_list: function(){
        Session.get('bots_config');
        var ret_list = [];
        var asset_list = [];
        for(var a_s in bots_config){
            if(asset_list.indexOf(a_s)<0)
                asset_list.push(a_s);
            for(var a_b in bots_config[a_s]){
                if(asset_list.indexOf(a_b)<0)
                    asset_list.push(a_b);
            }
        }
        for(var a in local_price){
            ret_list.push({"base":a, "_price":local_price[a][0], "quote":local_price[a][1]});
        }
        for(var index in asset_list){
            a2 = asset_list[index];
            if(!(a2 in local_price))
                ret_list.push({"base":a2, "_price":"", "quote":""});
        }
        return ret_list.sort(by('base'));
    }
});

FlowRouter.route('/null', {
    name: 'null',
    action(params, queryParams) {
        BlazeLayout.render('App_body', {main: 'null_page'});
    }
});

FlowRouter.route('/', {
    name: 'default',
    subscriptions: function(params, queryParams) {
        if(vb_days==28)
            this.register('vb_u_28', Meteor.subscribe("vb_u_28"));
        else
            this.register('vb_u_1', Meteor.subscribe("vb_u_1"));
        this.register('volume_m_1', Meteor.subscribe("volume_m_1"));
        this.register('volume_u_1', Meteor.subscribe("volume_u_1"));
    },
    action(params, queryParams) {
        URL={'P':'/', 'p': params};
        if(user_info['name'])
            Session.set("keyword", user_info['name']);
        else
            Session.set("keyword", "");
        Session.set('s_trx_limit', ITEMS_INC);
        Session.set('s_trx_filter', {});
        Session.set('s_order_filter', {});
        Session.set('title', TAPi18n.__('Block explorer'));
        Session.set('fav', "");
        BlazeLayout.render('App_body', {main: 'main_page'});
    }
});

FlowRouter.route('/account', {
    name: 'My account',
    subscriptions: function(params, queryParams) {
        var account = user_info['name'];
        this.register('account_volume_u_28', Meteor.subscribe('volume_u_28', 3, account));
        //this.register('account_balance', Meteor.subscribe('balance', 50, {'u': account}));
        this.register('account_volume_u_1', Meteor.subscribe("volume_u_1"));
    },
    action(params, queryParams) {
        if(!user_info['name'])
            FlowRouter.go('/');
        var account = user_info['name'];
        URL={'P':'account', 'p': {'_id': account}};
        Session.set("keyword", account);
        Session.set('s_trx_limit', ITEMS_INC);
        Session.set('s_trx_filter', { $or : [
            {"u_m": account},
            {"u": account},
            {"u_f": account},
            {"u_t": account}]});
        Session.set('s_order_filter', {'u': account});
        Session.set('title', TAPi18n.__('My account'));
        Session.set('fav', "");
        BlazeLayout.render('App_body', {main: 'user_page'});
    }
});

function clear_account(context) {
    Session.set('account', '');
}

FlowRouter.route('/u/:_id', {
    name: 'User.show',
    subscriptions: function(params, queryParams) {
        this.register('u_volume_u_28', Meteor.subscribe('volume_u_28', 3, params._id));
        this.register('u_volume_u_1', Meteor.subscribe("volume_u_1"));
    },
    triggersExit: [clear_account],
    action(params, queryParams) {
        if(user_info['name'] == params._id)
            FlowRouter.go('/account');
        Session.set('account', params._id);
        URL={'P':'u', 'p': params};
        Session.set("keyword", params._id);
        Session.set('s_trx_limit', ITEMS_INC);
        Session.set('s_trx_filter', { $or : [
            {"u_m": params._id},
            {"u": params._id},
            {"u_f": params._id},
            {"u_t": params._id}]});
        Session.set('s_order_filter', {'u': params._id});
        Session.set('title', TAPi18n.__('PageUser', params._id));
        var style="";
        if(favU.indexOf(params._id)>=0){
            style="style='color:green'";
        }
        Session.set('fav', '<a href="#" onclick="favorate_u(\''+params._id+'\')"> <span class="pull-right text-muted"> <i id="fav" '+style+' class="fa fa-heart fa-fw"></i></span></a>');
        BlazeLayout.render('App_body', {main: 'user_page'});
    }
});

function clear_asset(context) {
    Session.set('asset', '');
}

FlowRouter.route('/a/:_id', {
    name: 'asset.show',
    subscriptions: function(params, queryParams) {
        this.register('u_28_a', Meteor.subscribe('volume_u_28', 1, params._id, n_limit));
        this.register('volume_m_1', Meteor.subscribe("volume_m_1"));
        this.register('volume_u_1', Meteor.subscribe("volume_u_1"));
    },
    triggersExit: [clear_asset],
    action(params, queryParams) {
        URL={'P':'a', 'p': params};
        Session.set('asset', params._id);
        Session.set("keyword", params._id);
        Session.set('s_trx_limit', ITEMS_INC);
        Session.set('s_trx_filter', { $or: [
            {"a_p": params._id},
            {"a_r": params._id},
            {"a_c": params._id},
            {"a_d": params._id},
            {"a": params._id}
        ]});
        Session.set('s_order_filter', { $or: [
            {"a_s": params._id},
            {"a_b": params._id}
        ]});
        Session.set('title', TAPi18n.__('PageAsset', params._id));
        var style="";
        if(favA.indexOf(params._id)>=0){
            style="style='color:green'";
        }
        Session.set('fav', '<a href="#" onclick="favorate_a(\''+params._id+'\')"> <span class="pull-right text-muted"> <i id="fav" '+style+' class="fa fa-heart fa-fw"></i></span></a>');
        BlazeLayout.render('App_body', {main: 'asset_page'});
    }
});

function clear_market(context) {
    Session.set('market', '');
    $('#mm_spread_buy').tooltip('destroy');
    $('#mm_spread_sell').tooltip('destroy');
    //do_reset_order();
}

FlowRouter.route('/m/:_id', {
    name: 'market.show',
    triggersExit: [clear_market],
    subscriptions: function(params, queryParams) {
        this.register('arbitrage', Meteor.subscribe('arbitrage', params._id));
    },
    action(params, queryParams) {
        var market=params._id.split('_');
        var market_r = market[1]+'_'+market[0];
        if(favM.indexOf(market_r)>=0 && favM.indexOf(params._id)<0)
            FlowRouter.go('/m/'+market_r);
        Session.set('market', params._id);
        Session.set('update_market', params._id);
        URL={'P':'m', 'p': params};
        if(user_info['name'])
            Session.set("keyword", user_info['name']);
        Session.set('s_trx_limit', ITEMS_INC);
        Session.set('s_trx_filter', { $or: [
            {"a_p": market[0], "a_r": market[1]},
            {"a_r": market[0], "a_p": market[1]}
        ]});
        Session.set('s_order_filter', { $or: [
            {"a_s": market[0], "a_b": market[1]},
            {"a_s": market[1], "a_b": market[0]}
        ]});
        Session.set('title', TAPi18n.__('PageMarket', {a1: market[0], a2: market[1], p: toFixed2(ref_price(market[0], market[1]), 3)}));
        var style="";
        if(favM.indexOf(params._id)>=0){
            style="style='color:green'";
        }
        Session.set('fav', '<a href="#" onclick="favorate_m(\''+market[0]+"','"+market[1]+'\')"> <span class="pull-right text-muted"> <i id="fav" '+style+' class="fa fa-heart fa-fw"></i></span></a>');
        BlazeLayout.render('App_body', {main: 'market_page'});
    }
});

FlowRouter.route('/new/', {
    name: 'new',
    action(params, queryParams) {
        URL={'P':'new', 'p': params};
        BlazeLayout.render('new_page', {});
    }
});

FlowRouter.route('/settings', {
    name: 'settings',
    action(params, queryParams) {
        Session.set('title', TAPi18n.__('Bots Settings'));
        BlazeLayout.render('App_body', {main: 'settings_bots'});
    }
});


FlowRouter.route('/login/', {
    name: 'login',
    action(params, queryParams) {
        if(user_info['name'])
            FlowRouter.go('/');
        URL={'P':'login', 'p': params};
        //console.log(JSON.stringify(msg))
        if (localStorage.account) {
            account_list = JSON.parse(localStorage.account);
        }
        BlazeLayout.render('login_page', {accounts: account_list});
    }
});

FlowRouter.route('/logout/', {
    name: 'logout',
    action(params, queryParams) {
        URL={'P':'logout', 'p': params};
        //console.log(JSON.stringify(msg))
        localStorage.removeItem('enc_key');
        localStorage.removeItem('user_info');
        user_info = {"name": null};
        Meteor.logout();
        FlowRouter.go('/');
    }
});

FlowRouter.route('/exchange', {
    name: 'default',
    subscriptions: function(params, queryParams) {
        this.register('arbitrage', Meteor.subscribe("arbitrage"));
    },
    action(params, queryParams) {
        BlazeLayout.render('App_body', {main: 'exchange_page'});
    }
});

// whenever #showMoreResults becomes visible, retrieve more results
function showMoreVisible() {
    var threshold, target = $("#showMoreResults");
    if (!target.length) return;

    threshold = $(window).scrollTop() + $(window).height()*2.0 - target.height();

    if (target.offset().top < threshold) {
        if (!target.data("visible")) {
            // console.log("target became visible (inside viewable area)");
            target.data("visible", true);
            Session.set("s_trx_limit", Session.get("s_trx_limit") + ITEMS_INC);
        }
    } else {
        if (target.data("visible")) {
            // console.log("target became invisible (below viewable arae)");
            target.data("visible", false);
        }
    }
}

// run the above func every time the user scrolls
$(window).scroll(showMoreVisible);

do_remove_order = function(id){
    console.log('cancel order:', id);
    cancel_order(id);
}

do_limit_order = function(type){
    market = URL['p']['_id'].split('_');
    price = document.getElementById('price_'+type).value
        volume = document.getElementById('volume_'+type).value
        if (type == 'sell'){
            limit_order(volume, market[1], market[0], price);
        }else{
            limit_order(volume*price, market[0], market[1], 1/price);
        }
    $('.order').collapse('toggle');
}

do_reset_order = function(p, v){
    try{
        document.getElementById('price_buy').value='';
        document.getElementById('price_sell').value='';
        document.getElementById('volume_buy').value='';
        document.getElementById('volume_sell').value='';
        document.getElementById('value_buy').value='';
        document.getElementById('value_sell').value='';
        document.getElementById('mm_spread_buy').value='';
        document.getElementById('mm_spread_sell').value='';
        document.getElementById('mm_spread2_buy').value='';
        document.getElementById('mm_spread2_sell').value='';
        document.getElementById('mm_spread3_buy').value='';
        document.getElementById('mm_spread3_sell').value='';
        document.getElementById('mm_balance_buy').value='';
        document.getElementById('mm_balance_sell').value='';
        document.getElementById('mm_freq_buy').value='';
        document.getElementById('mm_freq_sell').value='';
        document.getElementById('mm_min_balance_buy').value='';
        document.getElementById('mm_min_balance_sell').value='';
    }catch(err){}
}

do_init_order = function(type, p, total, b){
    $('.mm_bot').collapse('hide');
    $('.order').collapse('show');
    document.getElementById('price_buy').value=formatPrice('buy', p);
    document.getElementById('price_sell').value=formatPrice('sell', p);
    var a=URL['p']['_id'].split('_');
    var usable_buy = _getBalance(user_info['name'], a[0]);
    var usable_sell = _getBalance(user_info['name'], a[1]);
    if(type == 'buy'){
        //document.getElementById('volume_buy').value=Math.min(b, usable_buy/formatPrice('buy', p));
        //document.getElementById('volume_sell').value=Math.min(total, usable_sell);
        document.getElementById('volume_buy').value=Math.min(b, usable_buy/formatPrice('buy', p));
        document.getElementById('volume_sell').value=total;
    }else{
        document.getElementById('volume_buy').value=total/formatPrice('buy', p);
        document.getElementById('volume_sell').value=Math.min(b, usable_sell);
    }
    $('#value_sell').val($('#volume_sell').val()*$('#price_sell').val());
    $('#value_buy').val($('#volume_buy').val()*$('#price_buy').val());
}

var save_bots = function(a_s, a_b, config){
    //console.log(config);
    if(!(a_s in bots_config))
        bots_config[a_s] = {};
    if(!(a_b in bots_config[a_s]))
        bots_config[a_s][a_b] = {};
    if(config.balance_cny*1.0 == 0.0){
        delete bots_config[a_s][a_b];
        if(Object.keys(bots_config[a_s]).length == 0)
            delete bots_config[a_s];
    }
    else{
        for(var key in config){
            if(config[key] == "")
                delete bots_config[a_s][a_b][key];
            else
                bots_config[a_s][a_b][key] = config[key];
        }
        if(!('t' in bots_config[a_s][a_b]))
            bots_config[a_s][a_b]['t'] = "mm1";
    }
    set_profile('bots_config', bots_config);
}

execute_bots = function(type){
    let market = URL['p']['_id'].split('_');
    let config = {};
    config.spread = document.getElementById('mm_spread_'+type).value;
    config.balance_cny = document.getElementById('mm_balance_'+type).value;
    config.t = document.getElementById('mm_t_'+type).value;
    if(config.t == "")
        config.t = "mm1";
    if (type == 'sell'){
        save_bots(market[1], market[0], config);
    }else{
        save_bots(market[0], market[1], config);
    }
}

collapse_order = function(){
    $('.mm_bot').collapse('hide');
    $('.order').collapse('toggle');
}

collapse_order_history = function(){
    $('.order_history').collapse('toggle');
}

favorate_a = function(asset){
    if(favA.indexOf(asset)>=0){
        favA.splice(favA.indexOf(asset), 1);
        document.getElementById('fav').style.color="";
    } else {
        favA.push(asset);
        document.getElementById('fav').style.color="green";
    }
    Session.set('favA', favA);
    set_profile('favA', favA);
}

favorate_m = function(a1, a2){
    var m = a1+"_"+a2;
    if(favM.indexOf(m)>=0){
        favM.splice(favM.indexOf(m), 1);
        document.getElementById('fav').style.color="";
    } else {
        favM.push(m);
        document.getElementById('fav').style.color="green";
    }
    Session.set('favM', favM);
    set_profile('favM', favM);
}

favorate_u = function(account){
    if(favU.indexOf(account)>=0){
        favU.splice(favU.indexOf(account), 1);
        document.getElementById('fav').style.color="";
    } else {
        favU.push(account);
        document.getElementById('fav').style.color="green";
    }
    Session.set('favU', favU);
    set_profile('favU', favU);
}

bots_enable = function(checkbox){
    if(checkbox.checked) {
        sessionStorage.enableBots = true;
        if(!g_config.disable_bots) enableBots = true;
        if(Meteor.isCordova)
            BackgroundMode.enable();
    }else{
        sessionStorage.removeItem('enableBots');
        enableBots = false;
        if(Meteor.isCordova)
            BackgroundMode.disable();
    }
}

getUserLanguage = function() {
    if (g_config.lang){return g_config.lang;}
    var defaultLang = navigator.language;
    if(!defaultLang)
        defaultLang = navigator.browserLanguage;
    return defaultLang;
}

//keep_alive = function(interval){
//    var website = Meteor.absoluteUrl()+FlowRouter.current().path;
//    var intervalId = Meteor.setInterval(function(){
//        try{
//            Meteor.http.get(website);
//        }catch(err){}
//    }, interval);
//}

Meteor.startup(() => {
handle_price=Meteor.subscribe("price");
Meteor.subscribe("volume_a_1");
Meteor.subscribe("global_properties");
Meteor.subscribe('chats', chats_limit);
db_global_properties.find().observe({
    added:function(_data){
        block_sync_info = _data;
        block_sync_info.syncTime = Date.now();
        Session.set("block_sync_info", block_sync_info);
    },
    changed:function(_data){
        var timeNow = Date.now();
        var timeLast =block_sync_info.syncTime;
        block_sync_info = _data;
        block_sync_info.syncTime = timeNow;
        Session.set("block_sync_info", block_sync_info);
        if(timeNow - timeLast < 3000*0.3 || timeNow - timeLast > 3000*1.7)
            return;
        if(b_debug)
            console.log("try lock,", timeNow);
        lock.acquire('bots', function(done){
            if(b_debug)
                console.log("got lock");
            run_bots(_data, done);
        }, function(err, ret){
            if(b_debug)
                console.log("done");
        });
    }
});
db_price.find().observe({
    added:function(_data){
        g_price[_data['a']] = _data['p']*1.0;
    },
    changed:function(_data){
        g_price[_data['a']] = _data['p']*1.0;
    }
});
Meteor.users.find().observe({
    added:function(_data){
        load_profile(_data.profile);
        Session.set('bots_config', '');
    },
    changed:function(_data){
        load_profile(_data.profile);
        Session.set('bots_config', '');
    }
});
db_asset_blacklist.find().observe({
    added:function(_data){
        asset_blacklist.push(_data.a);
    },
    removed:function(_data){
        asset_blacklist.splice(asset_blacklist.indexOf(_data.a), 1);
    },
});

if (localStorage.account) {
    account_list = JSON.parse(localStorage.account);
}

if (localStorage.vb_days) {
    vb_days = localStorage.vb_days;
}

if(Meteor.userId()){
    user_info = JSON.parse(localStorage.user_info);
}

Session.setDefault('s_trx_limit', ITEMS_INC);
Session.setDefault('s_trx_filter', {});
Session.setDefault('s_order_filter', {});
Deps.autorun(function(){
    Meteor.subscribe('TXInfinite', Session.get("s_trx_limit"), Session.get('s_trx_filter'));
    Meteor.subscribe('order_history', 50, Session.get('s_order_filter'));
    Meteor.subscribe('balance', Session.get('account'), Session.get('asset'), n_limit);
    Meteor.subscribe('order', Session.get('market'));
    Meteor.subscribe('asset_blacklist');
    if(user_info['name']){
        Meteor.subscribe('login_balance', user_info['name']);
        Meteor.subscribe('login_order', user_info['name']);
        db_balance.find({u: user_info['name'], a: "BTS"}).observe({
            changed:function(_data){
                balance_sync = true;
            },
});
    }
});
TAPi18n.setLanguage(getUserLanguage());
//keep_alive(60000);
if(Meteor.isCordova){
    if(enableBots)
        BackgroundMode.enable();
    BackgroundMode.setDefaults({
        title: "BTSBots wallet",
        ticker: "BTSBots is running in background",
        text: "the best trade bots"
    });
    Chats.find().observe({
        added:function(_data){
            BackgroundMode.configure({
                ticker: _data.user+": "+_data.msg,
                text: _data.user+": "+_data.msg
            });

        }
    });
}
});

revert_market = function(){
    var a=URL['p']['_id'].split('_');
    var market = a[0]+'_'+a[1];
    var market_r = a[1]+'_'+a[0];
    if(favM.indexOf(market)>=0)
        favM.splice(favM.indexOf(market), 1);
    favM.push(market_r);
    set_profile('favM', favM);
    FlowRouter.go('/m/'+market_r);
}
