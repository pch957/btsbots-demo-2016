const {Apis} = require("graphenejs-ws");
var {Signature, ops, ChainStore, FetchChain, PrivateKey, TransactionHelper, Aes, TransactionBuilder} = require("graphenejs-lib");
let objects = {};
pKey = null;
var last_cancel = {};
spread_good = 2/100.0;
bots_callback = {};
g_price_good = {};
new_order = [];
var cancel_orders = [];

import_private_key = function () {
    var account_name = document.getElementById("account").value;
    var private_key = document.getElementById("private_key").value;
    var secret = document.getElementById("private_password").value;
    ret = add_account(account_name, private_key, secret);
    if(!ret) {
        //console.log("wrong")
        //document.getElementById("msg_private").innerHTML="{{ _('private key is wrong') }}";
        document.getElementById("msg_private").innerHTML= ' \
            <div class="alert alert-danger alert-dismissable"> \
            <button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button> \
            private key is wrong \
            </div>'
            return false;
    }
}

add_account = function (account_name, private_key, secret) {
    try {
        var key = PrivateKey.fromWif(private_key);
        var key_hex = key.toHex();
        var aes = Aes.fromSeed(secret);
        var key_enc = aes.encryptHex(key_hex);
        var new_account = {"account":account_name, "active_key":key_enc};
        var found = 0;
        for (index in account_list){
            if (account_name == account_list[index]["account"]){
                account_list[index] = new_account;
                found = 1;
            }
        }
        if(found == 0){
            account_list.push(new_account);
        }
        localStorage.account = JSON.stringify(account_list);
        bts_login(account_name, secret);
        return true;
    }
    catch(err)
    {
        console.log(err);
        return false;
    }
}

bts_login = function (account_name, secret) {
    var key_enc = null;
    var account_list = [];
    if (localStorage.account) {
        account_list = JSON.parse(localStorage.account);
    }
    for (index in account_list){
        if (account_list[index]["account"] == account_name) {
            key_enc = account_list[index]["active_key"];
            break;
        }
    }
    try {
        var aes = Aes.fromSeed(secret);
        var key_hex = aes.decryptHex(key_enc);
        var key = PrivateKey.fromHex(key_hex);
        _bts_login(account_name, key, block_sync_info['T']);
    }
    catch(err)
    {
        console.log(err);
        document.getElementById("msg").innerHTML="wrong password";
        return [null, null];
    }
}

var _bts_login = function (account_name, key, time) {
    let pub_key = key.toPublicKey().toString('BTS');
    var verify = verify_key(account_name, key, time);
    if(!verify){
        console.log("login failed");
        return false;
    }
    var loginRequest = {user: account_name, pubkey: pub_key, verify: verify};
    //send the login request
    console.log("login", loginRequest);
    Accounts.callLoginMethod({
        methodArguments: [loginRequest],
        userCallback: function(){
            if (Meteor.userId()){
                var secret=Accounts._storedLoginToken();
                var key_hex = key.toHex();
                var aes = Aes.fromSeed(secret);
                var key_enc = aes.encryptHex(key_hex);
                localStorage.enc_key = key_enc;

                var user = Meteor.user();
                user_info = {};
                user_info['name'] = user['username'];
                user_info['bts_id'] = user['emails']['bts_id'];
                user_info['pub_key'] = user['emails']['pub_key'];
                localStorage.user_info = JSON.stringify(user_info);
                pKey = key;
                if(sessionStorage.activeKey){
                    sessionStorage.removeItem('activeKey');
                    copy_from_local();
                }
                FlowRouter.go('/');
            }
            else
                document.getElementById("msg").innerHTML="login failed";
        }
    });
}

var verify_key = function (account_name, key, time) {
    try {
        var data = {
            account: account_name,
            site: 'btsbots.com',
            time: time
        };
        data = new Buffer(JSON.stringify(data));
        var verify = {
            data: data.toString(),
            signature: Signature.signBuffer(data, key).toHex()
        };
        return verify;
    }
    catch(err)
    {
        console.log(err);
    }
}

build_limit_order = function(tr, account_id, amount, price, sellAsset, buyAsset){
    var sell_amount = Math.floor(amount*Math.pow(10, sellAsset['p']));
    var buy_amount_float = sell_amount*price*Math.pow(10, buyAsset['p']-sellAsset['p']);
    var buy_amount = Math.floor(buy_amount_float);
    if(sell_amount <= 0 || buy_amount <= 0)
        throw new Error('amount must>0');
    if(buy_amount_float/buy_amount - 1.0 > 0.001)
        sell_amount = Math.floor(buy_amount/(price*Math.pow(10,buyAsset['p']-sellAsset['p']))+0.5);
    tr.add_type_operation( "limit_order_create", {
        fee: {
            amount: 0,
            asset_id: "1.3.0"
        },
        seller: account_id,
        fill_or_kill: 0,
        expiration: "2100-01-01T00:00:00",
        amount_to_sell: { amount: sell_amount, asset_id: sellAsset["id"] },
        min_to_receive: { amount: buy_amount, asset_id: buyAsset["id"] }
    } )
    //console.log('tr is ',{ amount: sell_amount, asset_id: sellAsset["id"] } );
}

build_cancel_order = function(tr, account_id, o_id){
    tr.add_type_operation( "limit_order_cancel", {
        fee: {
            amount: 0,
            asset_id: '1.3.0'
        },
        fee_paying_account: account_id,
        order: '1.7.'+o_id
    } )
}

add_fees = async function(tr){
    let ops_all = [];
    tr.operations.forEach(function(e){ops_all.push(ops.operation.toObject(e))});
    let _ret = await Meteor.callPromise('getFee', ops_all);
    for (var i=0; i<tr.operations.length; i++){
        tr.operations[i][1].fee = {amount: _ret[i].amount, asset_id: '1.3.0'};
    }
}

finalized = function(tr){
    tr.add_signer(pKey, pKey.toPublicKey().toPublicKeyString('BTS'));
    tr.ref_block_num =  block_sync_info["B"] & 0xFFFF;
    tr.ref_block_prefix =  Buffer(block_sync_info["id"], 'hex').readUInt32LE(4);
    tr.expiration = Math.ceil(Date.now()/1000+86300);
    tr.tr_buffer = ops.transaction.toBuffer(tr);
    tr.sign('4018d7844c78f6a6c41c6a552b898022310fc5dec06da467ee7905a8dad512c8');
}

limit_order = async function(amount, asset1, asset2, price){
    var account_id = user_info['bts_id'];
    if (!(asset1 in objects) || !(asset2 in objects)){
        let _ret = await Meteor.callPromise('getAsset', [asset1, asset2]);
        objects[asset1] = _ret[0];
        objects[asset2] = _ret[1];
    }
    infoA1 = objects[asset1];
    infoA2 = objects[asset2];
    let tr = new TransactionBuilder();
    build_limit_order(tr, account_id, amount, price, infoA1, infoA2);
    await add_fees(tr);
    finalized(tr);
    let ret = await Meteor.callPromise("broadcast", ops.signed_transaction.toObject(tr));
}

cancel_order = async function(o_id){
    var account_id = user_info['bts_id'];
    let tr = new TransactionBuilder();
    build_cancel_order(tr, account_id, o_id);
    await add_fees(tr);
    finalized(tr);
    let ret = await Meteor.callPromise("broadcast", ops.signed_transaction.toObject(tr));
}

cancel_all_order = async function(){
    var account_id = user_info['bts_id'];
    let tr = new TransactionBuilder();
    for(var _market in orders_mine){
        for(var index in orders_mine[_market]){
            build_cancel_order(tr, account_id, orders_mine[_market][index]['id']);
        }
    }
    await add_fees(tr);
    finalized(tr);
    let ret = await Meteor.callPromise("broadcast", ops.signed_transaction.toObject(tr));
}

var bots_cancel_order = function(tr, account_id, e, controller, a_s, a_b){
    cancel_orders.push(e['id']);
    build_cancel_order(tr, account_id, e['id']);
    controller[a_s]['market'][a_b]['cancel'].push(e['id']);
    controller[a_s]['b_usable'] += e['b_s'];
}

//  controller={"CNY": {'b_usable':100, 'price': 1.0, 'market': {'BTS': {'price': 0.03, 'balance': 100}}, '...'}}}}
var force_make_order = function(tr, account_id, a_s, a_b, price, controller, amount){
    let bUsable = controller[a_s]['b_usable'];
    let price_in_cny = controller[a_s]['price'];
    if(bUsable < amount){
        var orders = get_orders_mine(a_s, a_b);
        for(var index in orders){
            var e = orders[index];
            if(bUsable >= amount)
                break;
            if(controller[a_s]['market'][a_b]['cancel'].indexOf(e['id'])<0){
                console.log('cancel order', e['id'], a_s, a_b);
                bots_cancel_order(tr, account_id, e, controller, a_s, a_b);
                bUsable += e['b_s'];
            }
        }
    }
    bUsable = controller[a_s]['b_usable'];
    amount = Math.min(amount, bUsable);
    if (amount*price_in_cny < 5.0) // too small, less than 5 CNY, don't sell
        return;
    console.log('new order', a_s, a_b, ' amount:', amount, 'price:', price);
    bUsable -= amount;
    controller[a_s]['b_usable'] = bUsable;
    new_order.push([account_id, amount, price, objects[a_s], objects[a_b]]);
    //build_limit_order(tr, account_id, amount, price, objects[a_s], objects[a_b]);
}

var bots_check_order = function(tr, account_id, a_s, a_b, price, controller, freq=20, price_limit=0.003){
    let found = false;
    let price_in_cny = controller[a_s]['price'];
    let amount = Math.min(
            controller[a_s]['market'][a_b]['balance_limit_buy']/price,
            controller[a_s]['market'][a_b]['balance_limit_sell']);
    var orders = get_orders_mine(a_s, a_b);
    for(var index in orders){
        var e = orders[index];
        // already in canceled list
        if(controller[a_s]['market'][a_b]['cancel'].indexOf(e['id'])>=0)
            continue;
        if(found){
            console.log('cancel extra order', e['id'], a_s, a_b);
            bots_cancel_order(tr, account_id, e, controller, a_s, a_b);
            continue;
        }
        if(e['b_s']/amount>1.1 ||
                e['b_s']/amount<0.9 && controller[a_s]['b_usable'] > 1.0/price_in_cny){
            console.log('cancel order', e['id'], a_s, a_b);
            console.log('because of balance', e['b_s'], 'change to', amount, e['id']);
            bots_cancel_order(tr, account_id, e, controller, a_s, a_b);
            continue;
        }
        if(!(a_s+"_"+a_b in last_cancel))
            last_cancel[a_s+"_"+a_b] = 0;
        if(block_sync_info['B']-last_cancel[a_s+"_"+a_b]>freq){

            var price1 = find_price1(user_info['name'], a_s, a_b, 0.1/controller[a_s]['market'][a_b]['price'], price);
            // correct from arbit price
            // var price0 = find_price1("", a_s, a_b, 0.1/controller[a_s]['market'][a_b]['price'], 0);
            var _scale=1/1.001;
            db_arbit.find({a_s:a_b, a_b:a_s}).forEach(function(e){
                var _price = e['p']*e['fb'];
                if(price * _price < _scale && price1*_price > 1.0){
                    console.log("[arbitrage] change price from ", price, " to ", _scale/_price);
                    price = _scale/_price;
                }
            });

            if (Math.abs(e['p']/price-1) > price_limit || price1 < e['p']){
                console.log('cancel order', e['id'], a_s, a_b);
                console.log('because of price:', e['p'], 'change to', price, e['id']);
                bots_cancel_order(tr, account_id, e, controller, a_s, a_b);
                last_cancel[a_s+"_"+a_b] = block_sync_info['B'];
                continue;
            }
        }
        found = true;
    }
    if(found)
        return;

    let bUsable = controller[a_s]['b_usable'];
    amount = Math.min(amount, bUsable);
    if (amount*price_in_cny < 1.0) // too small, less than 1 CNY, don't sell
        return;
    bUsable -= amount;
    controller[a_s]['b_usable'] = bUsable;

    console.log('new order', a_s, a_b, ' amount:', amount, 'price:', price);
    //build_limit_order(tr, account_id, amount, price, objects[a_s], objects[a_b]);
    new_order.push([account_id, amount, price, objects[a_s], objects[a_b]]);
}

var _get_price = function(a_s){
    if (a_s in price_all){
        if(a_s.indexOf("POLONIEX:USD")!=-1)
            return price_all[a_s]*price_all['USD'];
        if(a_s.indexOf("POLONIEX:BTC")!=-1)
            return price_all[a_s]*price_all['BTC'];
        return price_all[a_s];
    }
    var info = db_price.findOne({a: a_s});
    if(info){
        if(a_s.indexOf("POLONIEX:USD")!=-1){
            var info2 = db_price.findOne({a: 'USD'});
            if(info2)
                return info["p"]*info2["p"];
            return;
        }
        if(a_s.indexOf("POLONIEX:BTC")!=-1){
            var info2 = db_price.findOne({a: 'BTC'});
            if(info2)
                return info["p"]*info2["p"];
            return;
        }
        return info["p"];
    }
}

ref_price = function(a_q, a_b){
    var p_q =get_price(a_q)
    var p_b =get_price(a_b)
    if(p_q && p_b)
        return p_b/p_q;
}

get_price = function(a_s){
    var scale = 1.0;
    var asset_ref = a_s;
    var asset_refs = [];
    while(asset_ref in local_price && asset_refs.indexOf(local_price[asset_ref][1])<0){
        scale *= local_price[asset_ref][0];
        asset_ref = local_price[asset_ref][1];
        asset_refs.push(asset_ref);
    }
    return scale*_get_price(asset_ref);
}

var __getBalance = function(user, asset, type=1){
    if(!(asset in my_balance))
        return 0.0;
    if(type==0) // total balance include: free, in order, in colle
        return my_balance[asset][0];
    else if(type==1)// free balance, can use directely
        return my_balance[asset][1];
    else if(type==2)// usable balance by bots, include: free, in order.
        return my_balance[asset][2];
}

orders_all = {};
orders_mine = {};
price_all = {};
my_balance = {};

var add_my_balance = function(a, b0, b1){
    if(!(a in my_balance))
        my_balance[a] = [0.0, 0.0, 0.0];
    my_balance[a][1] += b0*1.0;
    my_balance[a][2] += b1*1.0;
}

var init_bots_data = function(){
    orders_all = {};
    orders_mine = {};
    price_all = {};
    my_balance = {};
    var cancel_done = true;
    db_price.find().forEach(function(e){
        price_all[e['a']] = e['p']*1.0;
    });

    db_balance.find({'u': user_info['name']}).forEach(function(e){
        my_balance[e['a']] = [e['b']*1.0, e['b']*1.0, e['b']*1.0];
    });

    db_order.find({}, {sort:{p:1}}).forEach(function(e){
        // settlement
        if(e['t'] == 4){
            if(e['u'] == user_info['name'])
                add_my_balance(e['a'], -e['b'], -e['b']);
        }
        // in order book
        else if(e['t'] == 7){
            var key = e['a_s']+"_"+e['a_b'];
            if(!(key in orders_all))
                orders_all[key] = [];
            orders_all[key].push(e);
            if(!(key in orders_mine))
                orders_mine[key] = [];
            if(e['u'] == user_info['name']){
                if(cancel_orders.indexOf(e['id'])>=0)
                    cancel_done = false;
                orders_mine[key].push(e);
                add_my_balance(e['a_s'], -e['b_s'], 0.0);
            }
        }
        else if(e['t'] == 8){
            if(e['u'] == user_info['name']){
            add_my_balance(e['a_c'], -e['b_c'], -e['b_c']);
            add_my_balance(e['a_d'], e['b_d'], e['b_d']);
            }
        }
    });
    if(cancel_done)
        cancel_orders = [];
    // my_orders = my_orders_list.sort().toString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

last_block = 0;
//wait_block = 1;

var need_bots_sync = function(block_now){
    if (block_now - last_block >= 10){
        cancel_orders = [];
        balance_sync = true;
    }
    if(cancel_orders.length || !balance_sync)
        return true;
    return false;
}

run_bots = async function(_data, cb){
    new_order = [];
    if(! bots_config || !enableBots){
        cb();
        return;
    }
    //if(_data['B'] - last_block < wait_block){
    //    cb();
    //    return;
    //}
    //if(Math.floor(Date.now()/1000) - _data["T"] >= 2.5){
    //    cb();
    //    return;
    //}
    if(b_debug)
        console.log("t:",_data["B"], Math.floor(Date.now()/1000), _data["T"]);
    //wait_block = 1;
    await sleep(1000);
    //console.log('run bots after block ', _data['B']);
    init_bots_data();
    //console.log(my_orders_last, my_orders);
    //if(my_orders_last == my_orders && _data['B'] - last_block < 10){
    if(need_bots_sync(_data["B"])){
        cb();
        return;
    }
    if(__getBalance(user_info['name'], 'BTS', 1)<1){
        console.log('need more BTS for fees');
        cb();
        return;
    }
    {
        //console.log('run bots', _data["B"]);
        console.log('run bots');
        let tr = new TransactionBuilder();
        var controller = {};
        var account_id = user_info['bts_id'];
        for (var a_s in bots_config) {
            if(asset_blacklist.indexOf(a_s)>=0)
                continue
            if (!(a_s in objects)){
                let _ret = await Meteor.callPromise('getAsset', [a_s]);
                if(!_ret.length){
                    asset_blacklist.push(a_s);
                    console.log('can not get asset info:' + a_s);
                    continue;
                }
                objects[a_s] = _ret[0];
            }
            let bUsable = __getBalance(user_info['name'], a_s, 1);
            let bUsable2 = __getBalance(user_info['name'], a_s, 2);
            if (a_s == 'BTS'){
                bUsable -= 100;
                bUsable2 -= 100;
            }
            let p_s = get_price(a_s);
            if(!p_s)
                continue;
            controller[a_s] = {'b_usable': bUsable, 'price': p_s, 'market': {}};

            var balance_total_order = 0.0;
            for(var a_b in bots_config[a_s]){
                if(asset_blacklist.indexOf(a_b)>=0)
                    continue
                if(a_b in bots_config && a_s in bots_config[a_b]){
                    if((1+bots_config[a_s][a_b]['spread']/100.0)*(1+bots_config[a_b][a_s]['spread']/100.0)<1.0){
                        console.log('wrong spread for market ' + a_s +'/'+ a_b +", sell price low than buy price");
                        continue;
                        }
                }
                if (!(a_b in objects)){
                    let _ret = await Meteor.callPromise('getAsset', [a_b]);
                    if(!_ret.length){
                        asset_blacklist.push(a_b);
                        console.log('can not get asset info:' + a_b);
                        continue;
                    }
                    objects[a_b] = _ret[0];
                }
                let p_b = get_price(a_b);
                if(!p_b)
                    continue;

                let balance_limit_buy = Infinity;
                if(a_b in bots_limit)
                    balance_limit_buy = bots_limit[a_b]*1.0;
                if('balance_limit' in bots_config[a_s][a_b])
                    balance_limit_buy = bots_config[a_s][a_b]['balance_limit']*1.0;
                balance_limit_buy -=  __getBalance(user_info['name'], a_b, 0)*p_b;
                balance_limit_buy = Math.max(balance_limit_buy, 0.0);
                let balance_limit_order = Math.min(
                        balance_limit_buy, bots_config[a_s][a_b]["balance_cny"]*1.0);
                balance_total_order += balance_limit_order;

                controller[a_s]['market'][a_b] = {
                    'price': p_b, 'cancel': [], 'balance_limit_buy': balance_limit_buy,
                    'balance_limit_order': balance_limit_order};
            }
            var b_scale=1.0;
            if(balance_total_order>bUsable2*p_s)
                b_scale *= bUsable2*p_s/balance_total_order;
            for(var a_b in controller[a_s]['market']){
                var balance_limit_sell = controller[a_s]['market'][a_b]["balance_limit_order"]*b_scale;
                balance_limit_sell = Math.max(balance_limit_sell , 10.0);
                let p_b = controller[a_s]['market'][a_b]['price'];
                controller[a_s]['market'][a_b]["balance_limit_order"]/=p_b;
                controller[a_s]['market'][a_b]["balance_limit_buy"]/=p_b;
                controller[a_s]['market'][a_b]["balance_limit_sell"]=balance_limit_sell/p_s;

                if( bots_config[a_s][a_b]['t'] in bots_callback &&
                        typeof(bots_callback[bots_config[a_s][a_b]['t']] == 'function')){
                    bots_callback[bots_config[a_s][a_b]['t']](tr, account_id, a_s, a_b);
                    continue;
                }
                if(b_debug)
                    console.log("run bots: ", a_s, a_b);
                if (!('t' in bots_config[a_s][a_b]))
                    bots_config[a_s][a_b]['t'] = 'mm1';
                if (bots_config[a_s][a_b]['t']=="mm1")
                    run_bots_mm1(tr, account_id, a_s, a_b, bots_config[a_s][a_b], controller);
            }
        }
        for(var index in new_order)
            build_limit_order(
                tr,
                new_order[index][0],
                new_order[index][1],
                new_order[index][2],
                new_order[index][3],
                new_order[index][4]);
        if(tr.operations.length) {
            //console.log("order:", tr);
            last_block = _data['B'];
            balance_sync = false;
            //wait_block = 2;
            await add_fees(tr);
            finalized(tr);
            let ret = await Meteor.callPromise("broadcast", ops.signed_transaction.toObject(tr));
        }
    }
    cb();
}

run_bots_mm1 = function(tr, account_id, a_s, a_b, config, controller){
    var spread = config['spread']/100.0;
    if(spread<-0.9)
        return;
    var price = controller[a_s]['price']/controller[a_s]['market'][a_b]['price']*(1+spread);
    bots_check_order(tr, account_id, a_s, a_b, price, controller, 0);
}

var get_orders_all = function(a_s, a_b){
    var key = a_s+"_"+a_b;
    if(!(key in orders_all))
        return [];
    return orders_all[key];
}

var get_orders_mine = function(a_s, a_b){
    var key = a_s+"_"+a_b;
    if(!(key in orders_mine))
        return [];
    return orders_mine[key];
}


find_price1 = function(account_name, a_s, a_b, balance, price_limit){
    var price1 = Infinity;
    var o_balance = 0.0;
    var orders = get_orders_all(a_s, a_b);
    for(var index in orders){
        var e = orders[index];
        if (price1 < e['p'])
            break;
        if (e['u']==account_name)
            continue;
        o_balance += e['b_b'];
        if(o_balance < balance || e['p']<price_limit)
            continue;
        price1 = e['p'];
    }
    //if(price1 == Infinity)
    //    price1 = price_limit*10.0;
    return price1;
}

find_good_order = function(a_s, a_b, price_limit){
    var balance = 0;
    var orders = get_orders_all(a_s, a_b);
    for(var index in orders){
        if(orders[index]['p'] > price_limit)
            break;
        balance+=orders[index]['b_b'];
    }
    return balance;
}

Meteor.startup(() => {
if(sessionStorage.activeKey && !Meteor.userId()){
    let key = PrivateKey.fromHex(sessionStorage.activeKey);
    var sync_info = Session.get("block_sync_info");
    _bts_login(sessionStorage.currentAccount, key, sync_info['T']);
}

if(Meteor.userId()){
    var aes = Aes.fromSeed(Accounts._storedLoginToken());
    var key_hex = aes.decryptHex(localStorage.enc_key);
    pKey = PrivateKey.fromHex(key_hex);
}
});
