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
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            console.log(request.payload.stripeToken);
            var token = request.payload.stripeToken; 
            
            firebase.auth().createUserWithEmailAndPassword(request.payload.email, request.payload.password).then(function(){
              stripe.customers.create({
                          email: request.payload.email,
                          source: token,
                }).then(function(customer) {
                              console.log(customer);
     
                            firebase.database().ref('hackers/'+request.payload.username).set({
                                username: request.payload.username,
                                email: request.payload.email,
                                customerId: customer.id
                            }).catch(function(error){
                                console.log(error);
                            });
                          var user = firebase.auth().currentUser;
                          user.updateProfile({
                              displayName: request.payload.username,
                            }).then(function() {
                              // Update successful.
                              
                              //Send Verification email
                              user.sendEmailVerification().then(function() {
                                  // Email sent.
                                  reply("Success. Verification sent to email. Please confirm.");
                                }).catch(function(error) {
                                  // An error happened.
                                  console.log(error);
                                });
                              
                            }).catch(function(error) {
                              // An error happened.
                              console.log(error);
                          });

                          
                          
              });
            }).catch(function(error) {
              // Handle Errors here.
              var errorCode = error.code;
              var errorMessage = error.message;
              console.log(errorCode);
              console.log(errorMessage);
              // ...
            });
            
        }
        
    });
    
    server.route({
        method: 'POST',
        path:'/resetPassword', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            console.log(request.payload.email);
            
            var auth = firebase.auth();
            var email = request.payload.email;
            
            auth.sendPasswordResetEmail(email).then(function() {
              // Email sent.
              reply("Password reset email sent. Check inbox.")
            }).catch(function(error) {
              // An error happened.
              console.log(error);
            });
        	
        }
        
    });
    
    server.route({
        method: 'POST',
        path:'/updateCard', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            console.log(firebase.auth().currentUser.email);
            
            firebase.database().ref('hackers').orderByChild('email').equalTo(firebase.auth().currentUser.email).on("value", function(snapshot) {
                console.log(snapshot.val());
                var keys = Object.keys(snapshot.val());
                console.log(keys[0]);
                var username = keys[0];
                
                var customerid = snapshot.val()[username].customerId;
                console.log(customerid);
                stripe.customers.update(customerid, {
                    source: request.payload.stripeToken
                }, function(err, customer) {
                    console.log("Successfully Updated Card");
                    console.log(customer);
                    reply("Success");
                });

            });
        	
        }
        
    });
    
    server.route({
        method: 'GET',
        path:'/getCurrentUser',
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            var user = firebase.auth().currentUser;
            console.log(user);
            reply(user);
        }
        
    });
    
    server.route({
        method: 'POST',
        path:'/login', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            
            console.log(request.payload);
            
            firebase.auth().signInWithEmailAndPassword(request.payload.email, request.payload.password).then(function(){
                console.log(firebase.auth().currentUser.email);
                var user = firebase.auth().currentUser;
                if(user.emailVerified == true){
                    reply(firebase.auth().currentUser);
                }else{
                    //Tell user to verify their email first
                    
                    firebase.auth().signOut().then(function() {
                      // Sign-out successful.
                      reply("Please verify first with the link sent to your email.")
                    }).catch(function(error) {
                      // An error happened.
                      console.log(error);
                    });
                }
                
            }).catch(function(error) {
                          // Handle Errors here.
                          var errorCode = error.code;
                          var errorMessage = error.message;
                          reply(errorMessage);
                          // ...
            });
            
            /*var usersRef = firebase.database().ref('hackers');
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
            });*/

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
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            console.log(request.payload);
            
            /*firebase.database().ref('products/'+ request.payload.itemid +'/owner').update({
                returned: true
            });*/
            
            firebase.database().ref('products/'+request.payload.itemid+'/owner').once('value').then(function(snapshot) {
                    var ownerId = snapshot.val().id;
                    console.log(ownerId);
                    if(ownerId !== null){
                        //Remove item from owner and owner from item
                        firebase.database().ref('hackers/'+ ownerId +'/signOuts/' + request.payload.itemid).remove();
                        firebase.database().ref('products/'+ request.payload.itemid +'/owner').remove();
                        reply("Item Returned.");
                    }else{
                        reply("Item not signed out");
                    }
              
            }).catch(function(error){
                reply("Error: Item not signed out");
            });
            
        }
 
        
    });
    
    
    server.route({
        method: 'POST',
        path:'/confirmReturn', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            console.log(request.payload);
            var itemid = request.payload.itemid;
            
            firebase.database().ref('products/'+itemid+'/owner').once('value').then(function(snapshot) {
                    var ownerId = snapshot.val().id;
                   //Remove item from owner and owner from item
                    firebase.database().ref('hackers/'+ ownerId +'/signOuts/' + itemid).remove();
                    firebase.database().ref('products/'+ itemid +'/owner').remove();
                    reply("Success. Item Returned.");
              
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
    
    //Users Dashboard for Admin
    server.route({
        method: 'GET',
        path:'/users', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
          firebase.database().ref('hackers').once('value').then(function(snapshot) {
            reply(snapshot.val());
          });
          
        }
        
    });
    
    //Charge a user
    server.route({
        method: 'POST',
        path:'/charge', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            var ownerId = request.payload.userid;
            var amount = request.payload.amount;
            
            if(amount > 0){
                   //charge Stripe
                   
                   //get Email & Customer Id
                   firebase.database().ref('hackers/'+ownerId).once('value').then(function(snapshot) {
                       stripe.charges.create({
                        amount: parseInt(amount+"00"),
                        currency: "cad",
                        customer: snapshot.val().customerId,
                       },function(err, charge) {
                          console.log(charge);
                          reply("Success. User has been Charged.");
                       });
                       
                   });
             }else{
                    reply("Please enter a positive number.");
             }
          
        }
        
    });
    
    
    function snapshotToArray(snapshot) {
        var returnArr = [];
    
        snapshot.forEach(function(childSnapshot) {
            var item = childSnapshot.val();
            item.key = childSnapshot.key;
    
            returnArr.push(item);
        });
    
        return returnArr;
    };
    
    
    // POS callback route
    server.route({
        method: 'POST',
        path:'/signOut', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            var usersRef = firebase.database().ref('hackers');
            
            usersRef.orderByChild('email').equalTo(request.payload.user).once('value', function(snapshot) {
                var snap = snapshotToArray(snapshot);
                console.log(snap);
                var exists = (snapshot.val() !== null);
                if(exists){
                        var itemsRef = firebase.database().ref('products');
                        itemsRef.child(request.payload.itemid).once('value', function(snapshot) {
                                var exists = (snapshot.val() !== null);
                                if(exists){
                                    console.log(snapshot.val());
                                    if(snapshot.val().owner == null){
                                        var userId = snap[0].username;
                                        var itemId = request.payload.itemid;
                                        firebase.database().ref('hackers/'+ userId +'/signOuts/' + itemId).set({
                                            id: itemId
                                        });
                                                
                                        firebase.database().ref('products/'+ itemId +'/owner').set({
                                            id: userId,
                                            email: snap[0].email
                                        });
                                        
                                        reply("Signout Successful");
                                    }else{
                                        reply("Item already signed out.");
                                    }
                                }else{
                                    
                                    reply("Error. No Such Item.");
                                    
                                }
                        });
                    }else{
                        
                        reply("Error. No Such User.");
                        
                    }
            });
            
            
            /*usersRef.child(request.payload.user).once('value', function(snapshot) {
                    var exists = (snapshot.val() !== null);
                    if(exists){
                        var itemsRef = firebase.database().ref('products');
                        itemsRef.child(request.payload.itemid).once('value', function(snapshot) {
                                var exists = (snapshot.val() !== null);
                                if(exists){
                                    var userId = request.payload.user;
                                    var itemId = request.payload.itemid;
                                    firebase.database().ref('hackers/'+ userId +'/signOuts/' + itemId).set({
                                        id: itemId
                                    });
                                            
                                    firebase.database().ref('products/'+ itemId +'/owner').set({
                                        id: userId,
                                        returned: false
                                    });
                                    
                                    reply("Signout Successful");
                                }else{
                                    
                                    reply("Error. No Such Item.");
                                    
                                }
                        });
                    }else{
                        
                        reply("Error. No Such User.");
                        
                    }
            });*/
        	
            
            
        	
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
        method: 'POST',
        path:'/addItem', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            console.log(request.payload);
            var itemid = request.payload.itemid;
            var name = request.payload.name;
            var value = request.payload.value;
            
            var usersRef = firebase.database().ref('products');
            usersRef.child(itemid).once('value', function(snapshot) {
                    var exists = (snapshot.val() !== null);
                    if(exists){
                        reply("Item already Exists.");
                    }else{
                        firebase.database().ref('products/'+ itemid).set({
                            id: itemid,
                            name: name,
                            value: value
                        });
                        
                        reply("Item Added!");
                        
                    }
            });
        }
    });
    
    server.route({
        method: 'POST',
        path:'/removeItem', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            console.log(request.payload);
            var itemid = request.payload.itemid;
            
            var usersRef = firebase.database().ref('products');
            usersRef.child(itemid).once('value', function(snapshot) {
                    var exists = (snapshot.val() !== null);
                    if(exists){
                        firebase.database().ref('products/'+ itemid).remove();
                        reply("Item Removed!");
                    }else{
                        
                        reply("Item does not exist.");
                        
                    }
            });
        }
        
    });
    
    server.route({
        method: 'POST',
        path:'/createUser', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            console.log(request.payload);
            var userid = request.payload.id;
            var email = request.payload.email;
            
            var usersRef = firebase.database().ref('hackers');
            usersRef.child(userid).once('value', function(snapshot) {
                    var exists = (snapshot.val() !== null);
                    if(exists){
                        reply("User ID already Exists.");
                    }else{
                        firebase.database().ref('hackers/'+ userid).set({
                            username: userid,
                            email: email
                        });
                        
                        reply("User Added!");
                        
                    }
            });
        }
    });
    
    server.route({
        method: 'POST',
        path:'/removeUser', 
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: function (request, reply) {
            console.log(request.payload);
            var userid = request.payload.id;
            
            var usersRef = firebase.database().ref('hackers');
            usersRef.child(userid).once('value', function(snapshot) {
                    var exists = (snapshot.val() !== null);
                    if(exists){
                        firebase.database().ref('hackers/'+ userid).remove();
                        reply("User Removed!");
                    }else{
                        
                        reply("User ID does not exist.");
                        
                    }
            });
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