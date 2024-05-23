document.getElementById('showPassword').addEventListener('change', function(event) {
    const passwordInput = document.getElementById('password');
    if (event.target.checked) {
        passwordInput.type = 'text';
    } else {
        passwordInput.type = 'password';
    }
});

document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const jsonData = {
        username: username,
        password: password
    };

    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(jsonData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Use the redirect URL provided by the server based on the user's role
            window.location.href = data.redirectUrl;
        } else {
            document.getElementById('loginForm').reset();
            alert('Login failed: ' + (data.message || ''));
        }
    });    
    
});
