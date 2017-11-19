'use strict';

const Hapi = require('hapi');
const Path = require('path');
const Hoek = require('hoek');
const unirest = require('unirest');

const base_url = "https://connect.squareup.com/v2";
const config = require('./config.json');

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
        			reply(response.body);
        		}
    	    });
    
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