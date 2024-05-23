document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('form');
    let status = document.getElementById('status')
    form.addEventListener('submit', function (e) {
        e.preventDefault(); // Prevent the default form submission

        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Check if passwords match
        if (password !== confirmPassword) {
            alert('Passwords do not match. Please try again.');
            return; // Stop the function if the passwords don't match
        }

        const formData = {
            username: document.getElementById('username').value,
            email: document.getElementById('email').value,
            password: password // Use the password variable here
        };

        fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        })
        .then(response => response.json())
        .then(data => {
            console.log('Success:', data);
            if (data.success) {
                // Reset form fields to empty
                form.reset();
                status.innerHTML = data.message;
                status.style.color = "green"
                window.location.href = '/login';
            } else {
                // Alert the user if username already exists or other error
                status.innerHTML = data.message;
                status.style.color = "red"
                form.reset();
            }
        })
        .catch((error) => {
            console.error('Error:', error);
            alert('An error occurred. Please try again.');
            form.reset();
        });
    });
});
