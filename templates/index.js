var mainApp = new Vue({
  el: '#main',
  
  ready: function() {

        // GET request
        this.$http.get('/dashboard', function (data) {
            console.log(data);
            // set data on vm
            this.$set('data', data)

        }).error(function (data, status, request) {
            // handle error
        })

   }
})