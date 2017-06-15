favU=['exchange.btsbots'];
favA=['BTS', 'CNY', 'USD', 'OPEN.BTC', 'GOLD'];
favM=['CNY_OPEN.BTC','CNY_USD',  'CNY_BTS', 'USD_BTS', 'OPEN.BTC_BTS'];
Session.set('favA', favA);
Session.set('favM', favM);
Session.set('favU', favU);
bots_config = {};
bots_limit= {};
local_price = {};
g_config = {};
enableBots = false;

set_profile = function(key, obj){
    var data = {};
    data['profile.'+key] = JSON.stringify(obj);
    Meteor.users.update({"_id": Meteor.userId()}, {$set: data});
}

load_profile = function(profile){
    if(!profile)
        return;
    if ('favA' in profile && favA != JSON.parse(profile['favA'])){
        favA = JSON.parse(profile['favA']);
        Session.set('favA', favA);
    }
    if ('favM' in profile && favM != JSON.parse(profile['favM'])){
        favM = JSON.parse(profile['favM']);
        Session.set('favM', favM);
    }
    if ('favU' in profile && favU != JSON.parse(profile['favU'])){
        favU = JSON.parse(profile['favU']);
        Session.set('favU', favU);
    }
    if ('bots_config' in profile){
        bots_config = JSON.parse(profile['bots_config']);
        update_bots_session(bots_config);
    }
    if ('bots_limit' in profile)
        bots_limit = JSON.parse(profile['bots_limit']);
    if ('local_price' in profile)
        local_price= JSON.parse(profile['local_price']);
    if ('config' in profile){
        g_config = JSON.parse(profile['config']);
        if ('lang' in g_config)
            TAPi18n.setLanguage(g_config['lang']);
    }
    if ('cancel_all' in profile){
        if(profile['cancel_all'] && enableBots)
        {
            cancel_all_order();
            Meteor.users.update({"_id": Meteor.userId()}, {$unset: {'profile.cancel_all': ""}});
        }
    }
    if (sessionStorage.enableBots && !g_config.disable_bots){ enableBots = true; }
}

copy_from_local = function(){
    if (localStorage.bots_config)
        set_profile('bots_config', JSON.parse(localStorage.bots_config));
    if (localStorage.bots_limit)
        set_profile('bots_limit', JSON.parse(localStorage.bots_limit));
    if (localStorage.local_price)
        set_profile('local_price', JSON.parse(localStorage.local_price));
    if (localStorage.favA)
        set_profile('favA', JSON.parse(localStorage.favA));
    if (localStorage.favM)
        set_profile('favM', JSON.parse(localStorage.favM));
    if (localStorage.favU)
        set_profile('favU', JSON.parse(localStorage.favU));
    if (localStorage.enableBots){sessionStorage.enableBots = true; enableBots = true;}
}
