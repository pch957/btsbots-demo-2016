Template.bots_limit_panel.events({
    'click #bots_limit_btn': function(e){
        var data = {}
        var $rows=$('#bots_limit_table').find('tr');
        $rows.each(function(){
            var $td=$(this).find('td');
            if(!$td[0] || !$td[1])
                return;
            var asset = $td.eq(0).text();
            var balance = $td.eq(1).text();
            if(balance)
                data[asset] = balance;
        });
        set_profile('bots_limit', data);
    },
    'keydown #input': function(e){
        if(e.keyCode!=13)
            return;
        var data = {}
        var $rows=$('#bots_limit_table').find('tr');
        $rows.each(function(){
            var $td=$(this).find('td');
            if(!$td[0] || !$td[1])
                return;
            var asset = $td.eq(0).text();
            var balance = $td.eq(1).text();
            if(balance)
                data[asset] = balance;
        });
        set_profile('bots_limit', data);
        return false;
    }
});

Template.local_price_panel.events({
    'click #local_price_btn': function(e){
        var data = {}
        var $rows=$('#local_price_table').find('tr');
        $rows.each(function(){
            var $td=$(this).find('td');
            if(!$td[0] || !$td[1] || !$td[2])
                return;
            var base = $td.eq(0).text();
            var price = $td.eq(1).text();
            var quote = $td.eq(2).text();
            if(price && quote)
                data[base] = [price, quote];
        });
        set_profile('local_price', data);
    },
    'keydown #input': function(e){
        if(e.keyCode!=13)
            return;
        //console.log($(e.currentTarget).text());
        //console.log(this);
        //if(!this._price)
        //    return;
        //local_price[this.base] = [this._price, this.quote];
        //set_profile('local_price', local_price);
        var data = {}
        var $rows=$('#local_price_table').find('tr');
        $rows.each(function(){
            var $td=$(this).find('td');
            if(!$td[0] || !$td[1] || !$td[2])
                return;
            var base = $td.eq(0).text();
            var price = $td.eq(1).text();
            var quote = $td.eq(2).text();
            if(price && quote)
                data[base] = [price, quote];
        });
        set_profile('local_price', data);
        return false;
    }
});

Template.order_book.events({
    'click #btn_config_bot': function(e){
        $('.order').collapse('hide');
        $('.mm_bot').collapse('toggle');
    }
});

Template.main_page_av.events({
    'click #btn_limit': function(e){
        change_limit();
    }
});

Template.nav.events({
    "click a.lang": function(e){
        lang = 'undefined';
        $this = $(e.target);
        lang = $this.data("lang");
        TAPi18n.setLanguage(lang);
        g_config.lang= lang;
        set_profile('config', g_config);
        return;
    }
});
