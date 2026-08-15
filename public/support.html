(function(){
  var form = document.getElementById('intake');
  var btn = document.getElementById('submitBtn');
  var result = document.getElementById('result');
  var errbox = document.getElementById('errbox');

  var TIER = {
    1: {cls:'t1',   label:'CUSTOMER-ACTIONABLE', title:'You can try this now'},
    2: {cls:'t2',   label:'SERVICE REQUIRED',    title:'This needs a service visit'},
    3: {cls:'t3',   label:'EMERGENCY STOP',      title:'Stop using the machine'}
  };

  function showError(msg){
    errbox.textContent = msg;
    errbox.classList.add('show');
  }
  function clearError(){ errbox.classList.remove('show'); }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    clearError();
    result.classList.remove('show');

    // honeypot: if filled, silently pretend success (drop the bot)
    if (document.getElementById('company_website').value){
      return;
    }

    var name = document.getElementById('name').value.trim();
    var email = document.getElementById('email').value.trim();
    var errorCode = document.getElementById('errorCode').value.trim();
    var message = document.getElementById('message').value.trim();

    if (!name || !email || !errorCode){
      showError('Please fill in your name, email, and the error code.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Looking up your code…';

    fetch('/api/support-intake', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:name, email:email, errorCode:errorCode, message:message})
    })
    .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, data:d}; }); })
    .then(function(res){
      btn.disabled = false;
      btn.textContent = 'Get the fix';

      if (!res.ok || !res.data || !res.data.ok){
        showError('Something went wrong sending your request. Please try again, or email factoryautomation@outlook.com directly.');
        return;
      }

      var d = res.data;
      var top = document.getElementById('resultTop');
      var t = d.tier && TIER[d.tier] ? TIER[d.tier] : {cls:'tnone', label:'RECEIVED', title:'We\u2019ve got your request'};

      top.className = 'card-top ' + t.cls;
      document.getElementById('resultTitle').textContent =
        (d.matched ? t.title : 'We\u2019ve received your request');
      document.getElementById('resultTier').textContent =
        (d.matched ? (d.matched + ' \u00b7 ' + t.label) : errorCode.toUpperCase());
      document.getElementById('resultBody').textContent = d.reply || '';
      document.getElementById('resultEmailed').textContent =
        'A copy has been sent to ' + email + '.';

      result.classList.add('show');
      result.scrollIntoView({behavior:'smooth', block:'nearest'});
      form.reset();
    })
    .catch(function(){
      btn.disabled = false;
      btn.textContent = 'Get the fix';
      showError('Couldn\u2019t reach the server. Check your connection and try again.');
    });
  });
})();
