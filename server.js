'use strict';

const Hapi = require('hapi');
const Path = require('path');
const Hoek = require('hoek');
const unirest = require('unirest');
const firebase = require("firebase");

const base_url = "https://connect.squareup.com/v2";
const config = require('./config.json');

const firebaseConfig = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    databaseURL: config.databaseURL,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId
  };
firebase.initializeApp(firebaseConfig);

// Create a server with a host and port
const server = new Hapi.Server();
server.connection({ 
    host: '0.0.0.0', 
    port: 8080 
});

function getItem(callback) {
	unirest.get(base_url + '/catalog/object/NRVDGFKWJGOE6H4UY7MKAHGV')
	.headers({
		'Authorization': 'Bearer ' + config.squareAccessToken,
		'Accept': 'application/json'
	})
	.end(function(response) {
        console.log("first response");
		callback(response, null);
		return;
		
	});
}

server.register(require('vision'), (err) => {
    Hoek.assert(!err, err);

    server.views({
        engines: {
            html: require('handlebars')
        },
        relativeTo: __dirname,
        path: 'templates'
    });
    
    // Add the route
    server.route({
        method: 'GET',
        path:'/hello', 
        handler: function (request, reply) {
            getItem(function(response, error){
        		if (error) {
        			reply(error);
        		} else {
        		    console.log(response.body);
        			reply.view('index', { productname: response.body.object.item_data.name });
        		}
    	    });
    
        }
        
    });
    
    // POS callback route
    server.route({
        method: 'GET',
        path:'/done', 
        handler: function (request, reply) {
            console.log(request.query);
            const uriData = JSON.parse(request.query.data);
            console.log(uriData);
            
            //Note: Item id can be passed via note
            
            firebase.database().ref('hackers/kshen/signOuts/1025').set({
                id: "1025"
            });
            
        	reply.view('done', { itemId: uriData.transaction_id });
        }
        
    });
    
    //firebase add hacker
    server.route({
        method: 'GET',
        path:'/firebaseAdd', 
        handler: function (request, reply) {

            firebase.database().ref('hackers/kshen').set({
                email: "kshen3778@gmail.com",
                signOuts: ["test"]
            });

        	reply.view('index');
        }
        
    });
    
    //firebase add item
    server.route({
        method: 'GET',
        path:'/firebaseAddItem', 
        handler: function (request, reply) {
            
            var productsRef = firebase.database().ref('products/1024');
            productsRef.set({
                name: "Muse",
                id: "1024"
            });

        	reply.view('index');
        }
        
    });
    
    
});

// Start the server
server.start((err) => {

    if (err) {
        throw err;
    }
    console.log('Server running at:', server.info.uri);
});