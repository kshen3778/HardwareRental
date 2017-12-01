'use strict';

const Hapi = require('hapi');
const Path = require('path');
const Hoek = require('hoek');
const unirest = require('unirest');
const firebase = require("firebase");
const openurl = require("openurl");
const opn = require("opn");

const base_urlv2 = "https://connect.squareup.com/v2";
const base_urlv1 = "https://connect.squareup.com/v1";
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

function getPaymentInfo(transactionId, callback) {
    
    unirest.get(base_urlv2 + '/locations/'+ config.squareLocationId + '/transactions/' + transactionId)
	.headers({
		'Authorization': 'Bearer ' + config.squareAccessToken,
		'Accept': 'application/json'
	})
	.end(function(response) {
	    console.log(response.raw_body);
	    var paymentId = JSON.parse(response.raw_body).transaction.tenders[0].id;
        console.log("Payment Id: " + paymentId);
        
		unirest.get(base_urlv1 + "/" + config.squareLocationId + "/payments/" + paymentId)
    	.headers({
    		'Authorization': 'Bearer ' + config.squareAccessToken,
    		'Accept': 'application/json'
    	})
    	.end(function(response2) {
            //console.log(response2.raw_body);
    		callback(response2.raw_body);
    		
    	});
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
    
    //firebase add item
    server.route({
        method: 'GET',
        path:'/', 
        handler: function (request, reply) {

        	reply.view('enterItem');
        }
        
    });
    
    // Add the route
    server.route({
        method: 'GET',
        path:'/hello', 
        handler: function (request, reply) {
            
        
            reply.view('index');
        }
        
    });
    
    // POS callback route
    server.route({
        method: 'GET',
        path:'/done', 
        handler: function (request, reply) {
            /*console.log(request.query);
            const uriData = JSON.parse(request.query.data);
            console.log(uriData);*/
            
            //Note: Item id can be passed via note
            
            getPaymentInfo("GOOsGLhdrsbHbar5rcTNhV8eV", function(response, error){
        		if (error) {
        			reply(error);
        		} else {
        		    
        		    firebase.database().ref('hackers/kshen/signOuts/1025').set({
                        id: "1025"
                    });
        		    console.log(response);
        			reply.view('done');
        		}
    	    });
            
            
        	
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