import { Meteor } from 'meteor/meteor';
var {Apis} = require("graphenejs-ws");
var {Signature, ChainStore, FetchChain, PublicKey, PrivateKey, TransactionHelper, Aes, TransactionBuilder} = require("graphenejs-lib");

Meteor.startup(() => {
    // code to run on server at startup
    db_op = new Meteor.Collection("op");
    db_order_history = new Meteor.Collection("order_history");
    db_global_properties = new Meteor.Collection("global_properties");
    Meteor.publish("global_properties", function () {return db_global_properties.find();});

    db_price = new Meteor.Collection("price");
    db_volume_m_1 = new Meteor.Collection("volume_m_1");
    db_volume_a_1 = new Meteor.Collection("volume_a_1");
    db_volume_u_1 = new Meteor.Collection("volume_u_1");
    db_volume_u_28 = new Meteor.Collection("volume_u_28");
    db_vb_u_28 = new Meteor.Collection("vb_u_28");
    db_vb_u_1 = new Meteor.Collection("vb_u_1");
    db_balance = new Meteor.Collection("balance");
    db_order = new Meteor.Collection("order");
    db_account = new Meteor.Collection("account");
    db_asset = new Meteor.Collection("asset");
    db_arbit = new Meteor.Collection("arbitrage");
    Chats = new Meteor.Collection("chats");
    db_asset_blacklist = new Meteor.Collection("asset_blacklist");

    Meteor.publish("asset_blacklist", function () {return db_asset_blacklist.find();});
    Meteor.publish("price", function () {return db_price.find();});
    Meteor.publish('arbitrage', function(market) {
        if(!this.userId)
            return;
        if (market){
            var asset = market.split('_');
            filter = { $or: [
                {"a_s": asset[0], "a_b": asset[1]},
                {"a_s": asset[1], "a_b": asset[0]}]}
            return db_arbit.find(filter);
        }
    });
    Meteor.publish("vb_u_28", function () {return db_vb_u_28.find();});
    Meteor.publish("vb_u_1", function () {return db_vb_u_1.find();});
    Meteor.publish("volume_m_1", function () {return db_volume_m_1.find();});
    Meteor.publish("volume_a_1", function () {return db_volume_a_1.find();});
    Meteor.publish("volume_u_1", function () {return db_volume_u_1.find();});
    Meteor.publish("volume_u_28", function (type, _id, limit) {
        if(type ==1)
            return db_volume_u_28.find({a:_id}, {sort:{v:-1}, limit:limit});
        else if(type ==2)
            return db_volume_u_28.find({a:_id}, {sort:{b:-1}, limit:limit});
        else
            return db_volume_u_28.find({u:_id});
    });
    Meteor.publish('balance', function(account, asset, limit) {
        if(asset)
            return db_balance.find({'a': asset}, { limit: limit, sort: { b: -1 } });
        if(account)
            return db_balance.find({'u': account});
    });
    Meteor.publish('login_balance', function(user) {
        return db_balance.find({'u': user}, {sort: { b: -1 } });
    });
    Meteor.publish('order', function(market) {
        if (market){
            var asset = market.split('_');
            filter = { $or: [
                {"a_s": asset[0], "a_b": asset[1]},
                {"a_s": asset[1], "a_b": asset[0]}]}
            return db_order.find(filter);
        }
    });
    Meteor.publish('login_order', function(user) {
        return db_order.find({'u': user});
    });

    Meteor.publish('TXInfinite', function(limit, query) {
        return db_op.find(query, { limit: limit, sort: { id: -1 } });
    });
    Meteor.publish('order_history', function(limit, query) {
        return db_order_history.find(query, { limit: limit, sort: { id: -1 } });
    });
    Meteor.publish("chats", function (limit) {
        if(limit > 100)
            limit = 100;
        return Chats.find({}, {sort: {ts: -1}, limit: limit});
    });

    apis = Apis.instance("ws://localhost:8090/ws", true);
    apis.init_promise.then((res) => {
        console.log("connected to:", res[0].network_name, "network");
    });
    Future = Npm.require('fibers/future');
    Meteor.methods({
        chat_msg: function(data){
            //check(this.userId, String);
            //check(data, String);
            if(!this.userId)
                return;
            Chats.insert({user: Meteor.user().username, msg: data.toString(), ts: new Date()});
        },
        broadcast: function(trs){
            for (var index in trs["operations"]){
                var trx = trs["operations"][index];
                if (trx[0] == 1 && trx[1]["amount_to_sell"]["amount"] <= 0)
                    return false;
            }
            var myFuture = new Future();
            Promise.all([
                    apis.network_api().exec('broadcast_transaction', [trs])
            ]).then((res)=> {
                myFuture.return();
            }).catch((error)=> {
                myFuture.return();
                console.log('error:', error);
                console.log(JSON.stringify(trs));
                return false;
            });
            myFuture.wait();
            return true;
        },
        getFee: function(ops){
            var ret = [];
            var myFuture = new Future();
            Promise.all([
                    apis.db_api().exec('get_required_fees', [ops, '1.3.0'])
            ]).then((res)=> {
                res[0].forEach(function(e){
                    ret.push(e);
                });
                myFuture.return();
            });
            myFuture.wait();
            return ret;
        },
        getAsset: function(objects){
            var ret = [];
            objects.forEach(function(element){
                if(element == "PEERPLAYS")
                    return;
                _o = db_account.findOne({'a': element});
                if(_o){
                    ret.push(_o);
                    return ret;
                }
                var myFuture = new Future();
                Promise.all([
                        FetchChain("getAsset", element),
                ]).then((res)=> {
                    let [_Asset] = res;

                    let infoAsset = {'a': _Asset.get('symbol'), 'id': _Asset.get('id'), 'p': _Asset.get('precision')}
                    ret.push(infoAsset);
                    myFuture.return();
                }).catch((error)=> {
                    myFuture.return();
                    console.log("error got asset info: "+element);
                    console.log(error);
                });
                myFuture.wait();
            });
            return ret;
        },
        getAccount: function(objects){
            var ret = [];
            objects.forEach(function(element){
                _o = db_account.findOne({'u': element});
                if(_o){
                    ret.push(_o);
                    return ret;
                }
                var myFuture = new Future();
                Promise.all([
                        FetchChain("getAccount", element),
                ]).then((res)=> {
                    let [_Account] = res;
                    let infoAccount = {'u': _Account.get('name'), 'id': _Account.get('id'), 'active_key': _Account.getIn(['active', 'key_auths', 0, 0])}
                    // let infoAccount = {'u': _Account.get('name'), 'id': _Account.get('id')}
                    ret.push(infoAccount);
                    myFuture.return();
                }).catch((error)=> {
                    myFuture.return();
                    console.log("error got account info: "+element);
                    console.log(error);
                });
                myFuture.wait();
            });
            return ret;
        }
    });

    Accounts.registerLoginHandler(function(loginRequest) {
        //there are multiple login handlers in meteor.
        //a login request go through all these handlers to find it's login hander
        //so in our login handler, we only consider login requests which has admin field
        //console.log(loginRequest);
        if(!loginRequest.verify || !loginRequest.pubkey || !loginRequest.user) {
            return undefined;
        }

        var myFuture = new Future();
        var infoAccount = null;
        Promise.all([
                FetchChain("getAccount", loginRequest.user),
        ]).then((res)=> {
            let [_Account] = res;
            infoAccount = {'u': _Account.get('name'), 'id': _Account.get('id'), 'active_key': _Account.getIn(['active', 'key_auths', 0, 0])}
            // let infoAccount = {'u': _Account.get('name'), 'id': _Account.get('id')}
            myFuture.return();
        }).catch((error)=> {
            myFuture.return();
            console.log("error got account info: "+element);
            console.log(error);
        });
        myFuture.wait();
        if(!infoAccount)
            return null;

        //console.log(loginRequest.verify);
        //our authentication logic :)
        if(loginRequest.pubkey!=infoAccount['active_key']) {
            console.log("wrong active key:", loginRequest.user);
            return null;
        }
        //console.log('hello ob', loginRequest.verify);
        var signature=Signature.fromHex(loginRequest.verify.signature);
        var key=PublicKey.fromPublicKeyString(infoAccount['active_key'], "BTS");
        if(! signature.verifyBuffer(new Buffer(loginRequest.verify.data), key)){
            console.log("wrong signature:", loginRequest.user);
            return null;
        }
        var data=JSON.parse(loginRequest.verify.data.toString());
        if((Math.ceil(Date.now()/1000)-data['time']) > 600){
            console.log("time out:", loginRequest.user);
            return null;
        }
        if(data['site'] != "btsbots.com" || data['account'] != loginRequest.user)
            return null;

        //we create a admin user if not exists, and get the userId
        var userId = null;
        var user = Meteor.users.findOne({username: loginRequest.user});
        if(!user) {
            userId = Meteor.users.insert({
                username: loginRequest.user,
                emails: {pub_key: infoAccount['active_key'], bts_id: infoAccount['id']}
            });
            //console.log("hello1", userId);
        } else {
            userId = user._id;
            //console.log("hello2", userId);
        }

        //send loggedin user's user id
        return {
            userId: userId
        }
    });
});
