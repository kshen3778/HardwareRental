'use strict';

const Hapi = require('hapi');
const Path = require('path');
const Hoek = require('hoek');
const unirest = require('unirest');
const firebase = require("firebase");
const openurl = require("openurl");
const opn = require("opn");
var bcrypt = require('bcrypt');

const base_urlv2 = "https://connect.squareup.com/v2";
const base_urlv1 = "https://connect.squareup.com/v1";
const config = require('./config.json');

var stripe = require("stripe")("sk_test_3CQrKqlt0k8k85z69OrK5Y6A");

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

function getAllProducts(callback){
  firebase.database().ref('products').once('value').then(function(snapshot) {
    callback(snapshot.val());
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
    
   
    server.route({
        method: 'GET',
        path:'/', 
        handler: function (request, reply) {

        	reply.view('newUser');
        }
        
    });

    server.route({
        method: 'POST',
        path:'/addUser', 
        handler: function (request, reply) {
            console.log(request.payload);
            var token = request.payload.stripeToken; 
            
            bcrypt.genSalt(12, function(err, salt) {
                bcrypt.hash(request.payload.password, salt, function(err, hash) {
                  
                  var usersRef = firebase.database().ref('hackers');
                  usersRef.child(request.payload.username).once('value', function(snapshot) {
                    var exists = (snapshot.val() !== null);
                    if(exists){
                        reply("User already registered");
                    }else{
                        
                        stripe.customers.create({
                          email: request.payload.email,
                          source: token,
                        }).then(function(customer) {
                          console.log(customer);
 
                          firebase.database().ref('hackers/'+request.payload.username).set({
                            username: request.payload.username,
                            email: request.payload.email,
                            password: hash,
                            customerId: customer.id
                          });
                          
                          reply("Success");
                          
                        });
                        
                    }
                  });

                }); // end bcrypt.hash
            }); // end bcrypt.genSalt

        }
        
    });
    
    server.route({
        method: 'GET',
        path:'/userLogin', 
        handler: function (request, reply) {
            
            reply.view('login');
        }
        
    });
    
    server.route({
        method: 'POST',
        path:'/login', 
        handler: function (request, reply) {
            
            console.log(request.payload);
            
            var usersRef = firebase.database().ref('hackers');
            usersRef.child(request.payload.username).once('value', function(snapshot) {
                    var exists = (snapshot.val() !== null);
                    if(exists){
                        bcrypt.compare(request.payload.password, snapshot.val().password, function (err, isValid) {
                            if(!err && isValid) {
                              reply.view('profile', {info: snapshot.val()}); // or what ever you want to rply
                            } else {
                              reply("Bad Password");
                            } 
                        });
                    }else{
                        reply("Invalid Username");
                        
                    }
            });

        }
        
    });
    
    //Return Page
    server.route({
        method: 'GET',
        path:'/return', 
        handler: function (request, reply) {
          
        	reply.view('return');
        }
        
    });
    
    //Return Item 
    server.route({
        method: 'POST',
        path:'/returnItem', 
        handler: function (request, reply) {
            console.log(request.payload);
            
            firebase.database().ref('products/'+ request.payload.itemidfield +'/owner').update({
                returned: true
            });
            
            reply.view('return');
            
            /*firebase.database().ref('products/'+ request.payload.itemidfield).once('value').then(function(snapshot) {
              var item = snapshot.val();
              var transactionId = item.owner.transactionId;
              console.log(transactionId);
              unirest.get(base_urlv2 + '/locations/'+ config.squareLocationId + '/transactions/' + transactionId)
            	.headers({
            		'Authorization': 'Bearer ' + config.squareAccessToken,
            		'Accept': 'application/json'
            	})
            	.end(function(response) {
            	    console.log(response.raw_body);
                    var tenderId = JSON.parse(response.raw_body).transaction.tenders[0].id;
                    var amountOfMoney = JSON.parse(response.raw_body).transaction.tenders[0].amount_money.amount;
                    console.log(tenderId + " " + amountOfMoney);
                    
                    var key = new Date().valueOf();
                    unirest.post(base_urlv2 + '/locations/'+ config.squareLocationId + '/transactions/' + transactionId + '/refund')
                        .headers({
                    		'Authorization': 'Bearer ' + config.squareAccessToken,
                    		'Accept': 'application/json',
                    		'Content-Type': 'application/json'
                    	})
                        .send({ 
                              "idempotency_key": ""+key,
                              "tender_id": ""+tenderId,
                              "reason": "Returned Hardware",
                              "amount_money": {
                                "amount": amountOfMoney,
                                "currency": "CAD"
                              }
                            })
                        .end(function (response) {
                          console.log(response.raw_body);
                          
                          
                          //Get Item owner
                          var owner = item.owner.id;
                          
                          //Remove item from owner and owner from item
                          firebase.database().ref('hackers/'+ owner +'/signOuts/' + request.payload.itemidfield).remove();
                          firebase.database().ref('products/'+ request.payload.itemidfield +'/owner').remove();
                          
                          reply.view('return');
                        });
                    
            	});
            }); */
            
        }
 
        
    });
    
    
    server.route({
        method: 'POST',
        path:'/refund', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
          console.log(request.payload);
        	firebase.database().ref('products/'+ request.payload.itemidfield).once('value').then(function(snapshot) {
              var item = snapshot.val();
              var transactionId = item.owner.transactionId;
              console.log(transactionId);
              unirest.get(base_urlv2 + '/locations/'+ config.squareLocationId + '/transactions/' + transactionId)
            	.headers({
            		'Authorization': 'Bearer ' + config.squareAccessToken,
            		'Accept': 'application/json'
            	})
            	.end(function(response) {
            	    console.log(response.raw_body);
                    var tenderId = JSON.parse(response.raw_body).transaction.tenders[0].id;
                    var amountOfMoney = parseInt(request.payload.amount);
                    console.log(tenderId + " " + amountOfMoney);
                    
                    var key = new Date().valueOf();
                    unirest.post(base_urlv2 + '/locations/'+ config.squareLocationId + '/transactions/' + transactionId + '/refund')
                        .headers({
                    		'Authorization': 'Bearer ' + config.squareAccessToken,
                    		'Accept': 'application/json',
                    		'Content-Type': 'application/json'
                    	})
                        .send({ 
                              "idempotency_key": ""+key,
                              "tender_id": ""+tenderId,
                              "reason": "Returned Hardware",
                              "amount_money": {
                                "amount": amountOfMoney,
                                "currency": "CAD"
                              }
                            })
                        .end(function (response) {
                          console.log(response.raw_body);
                          
                          
                          //Get Item owner
                          var owner = item.owner.id;
                          
                          //Remove item from owner and owner from item
                          firebase.database().ref('hackers/'+ owner +'/signOuts/' + request.payload.itemidfield).remove();
                          firebase.database().ref('products/'+ request.payload.itemidfield +'/owner').remove();
                          
                          reply(response.raw_body);
                        });
                    
            	});
            });
        }
        
    });
    
    //Status Dashboard
    server.route({
        method: 'GET',
        path:'/dashboard', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
          getAllProducts(function(response, error){
            
            reply(response);
          });
          
        }
        
    });
    
    
    
    // POS callback route
    server.route({
        method: 'GET',
        path:'/done', 
        handler: function (request, reply) {
            const uriData = JSON.parse(request.query.data);
            console.log(uriData);
            //Note: Item id can be passed via note
            
            getPaymentInfo(uriData.transaction_id, function(response, error){
        		if (error) {
        		    console.log("error");
        			reply(error);
        		} else {
        		    
        		    console.log(JSON.parse(response));
        		    var note = JSON.parse(response).itemizations[0].notes;
        		    console.log("Note: " + note);
        		    var idInfo = note.split(",");
        		    
        		    firebase.database().ref('hackers/'+ idInfo[1] +'/signOuts/' + idInfo[0]).set({
                        id: idInfo[0],
                        transactionId: uriData.transaction_id
                    });
                    
                    firebase.database().ref('products/'+ idInfo[0] +'/owner').set({
                        id: idInfo[1],
                        transactionId: uriData.transaction_id,
                        returned: false
                    });
        		    
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
    
    server.route({
        method: 'GET',
        path: '/getItem/{itemid}',
        handler: function(request, reply){
            firebase.database().ref('products/'+ request.params.itemid).once('value').then(function(snapshot) {
               
               reply(snapshot.val()); 
            });
        }
    })
    
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
    
    //Populate Items from Spreadsheet
    server.route({
        method: 'GET',
        path:'/populateItems', 
        handler: function (request, reply) {
            
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