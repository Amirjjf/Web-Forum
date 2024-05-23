const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg'); // Import the Pool class from the pg package
const app = express();


const session = require('express-session');

app.use(session({
  secret: 'secret_key123',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set to true if you're using https
}));


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

// Serve static files from the current directory
app.use(express.static(path.join(__dirname, 'public')));


// Create a new instance of the Pool class with your PostgreSQL connection details
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'forum',
    password: 'password',
    port: 5432, // Default PostgreSQL port is 5432
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const userQuery = 'SELECT user_id, password, role FROM users WHERE username = $1';
        const userResult = await pool.query(userQuery, [username]);

        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.userId = user.user_id;
                req.session.username = username;
                req.session.role = user.role; // Store role in session
                
                // Depending on the role, send a different redirect URL
                let redirectUrl = user.role === 3 ? '/forum' : '/admin';
                res.json({ success: true, redirectUrl: redirectUrl });
            } else {
                res.status(401).json({ success: false, message: "Login failed" });
            }
        } else {
            res.status(401).json({ success: false, message: "Login failed" });
        }
    } catch (error) {
        console.error('Error verifying login:', error);
        res.status(500).json({ success: false, message: "An error occurred" });
    }
});


app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Check if the user already exists
        const userExistsQuery = 'SELECT * FROM users WHERE username = $1';
        const userExistsResult = await pool.query(userExistsQuery, [username]);

        // If the user already exists, send an error response
        if (userExistsResult.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Username already exists." });
        }

        // If the user does not exist, proceed with registration
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = 'INSERT INTO users(username, email, password, register_date, role) VALUES ($1, $2, $3, date_trunc(\'second\', current_timestamp), 3)';
        const values = [username, email, hashedPassword];

        await pool.query(query, values);
        res.json({ success: true, message: "User registered successfully." });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ success: false, message: "Error registering user." });
    }
});

app.use((req, res, next) => {
    req.loggedInUserId = req.session.userId;
    next();
});

app.get('/user/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const loggedInUserId = req.session.userId;  // The ID of the currently logged-in user
    if (isNaN(userId)) {
        return res.status(400).send('Invalid user ID');
    }

    try {
        const query = 'SELECT * FROM users WHERE user_id = $1';
        const values = [userId];

        const result = await pool.query(query, values);
        const user = result.rows[0];

        // Check for null values and replace with default values
        user.username = user.username || 'No username';
        user.email = user.email || 'No email';
        user.register_date = user.register_date || 'No register date';
        user.id = user.user_id;

        // Fetch threads from the database
        const threadsQuery = 'SELECT * FROM thread WHERE author = $1'; //Has index in place which query planner determines to use if it is the most efficient way to execute the query
        const threadsValues = [userId];
        const threadsResult = await pool.query(threadsQuery, threadsValues);
        const threads = threadsResult.rows;

        // Render the 'user-profile' EJS template and pass the user data to it
        res.render('user', { user, loggedInUserId, threads });
    } catch (error) {
        console.error('Error retrieving user profile:', error);
        // If there's an error, send a response to prevent the client from waiting indefinitely
        res.status(500).send('Error retrieving user profile');
    }
});

app.get('/thread/:threadId', async (req, res) => {
    const { threadId } = req.params;

    try {
        const query = 'SELECT t.title, t.text, t.category, c.name as category_name FROM thread t JOIN category c ON t.category = c.category_id WHERE t.post_id = $1';
        const result = await pool.query(query, [threadId]);
        const thread = result.rows[0];

        const commentQuery = 'SELECT comment.*, users.username FROM comment JOIN users ON comment.author = users.user_id WHERE post_id = $1';
        const commentResult = await pool.query(commentQuery, [threadId]);
        const comment = commentResult.rows;


        const userId = req.session.userId;
        const username = req.session.username;

        // Render the 'thread' EJS template and pass the thread, category name, and comments to it
        res.render('thread', { thread, category: thread.category_name, comment, userId, username, threadId: threadId});
    } catch (error) {
        console.error('Error retrieving thread:', error);
        // If there's an error, render an error page
    }
});

app.get('/category/:categoryId', async (req, res) => {
    const { categoryId } = req.params;

    try {
        const query = 'SELECT name, description FROM category WHERE category_id = $1';
        const result = await pool.query(query, [categoryId]);
        const category = result.rows[0];

        const threadsQuery = 'SELECT *, users.username FROM thread JOIN users ON thread.author = users.user_id WHERE category = $1';
        const threadsResult = await pool.query(threadsQuery, [categoryId]);
        const threads = threadsResult.rows;

        for (let i = 0; i < threads.length; i++) {
            const tagsQuery = 'SELECT tag.* FROM post_tags INNER JOIN tag ON post_tags.tag_id = tag.tag_id WHERE post_id = $1';
            const tagsResult = await pool.query(tagsQuery, [threads[i].post_id]);
            threads[i].tags = tagsResult.rows;
        }

        // Run the query once before the loop
        const tagsQuery = 'SELECT * FROM tag';
        const tagsResult = await pool.query(tagsQuery);
        const allTags = tagsResult.rows;

        const userId = req.session.userId;
        const username = req.session.username;

        res.render('category', { category, threads, userId, username, categoryId: categoryId, allTags});
    } catch (error) {
        console.error(error);
    }
});


app.post('/add-thread', express.json(), async (req, res) => {
    const { title, text, category, author, tags } = req.body;

    try {
        const query = 'INSERT INTO thread(title, text, category, author, posted) VALUES ($1, $2, $3, $4, date_trunc(\'second\', current_timestamp)) RETURNING post_id';
        const values = [title, text, category, author];
        const result = await pool.query(query, values);
        const postId = result.rows[0].post_id;

        const tagQuery = 'INSERT INTO post_tags(post_id, tag_id) VALUES ($1, $2)';
        for (let i = 0; i < tags.length; i++) {
            await pool.query(tagQuery, [postId, tags[i]]);
        }

        res.redirect(`/category/${category}`);
    } catch (error) {
        console.error('Error adding thread:', error);
    }
});


app.post('/add-comment', express.json(), async (req, res) => {
    const { post_id, body, author } = req.body;

    try {
        const query = 'INSERT INTO comment(post_id, body, author, time_posted) VALUES ($1, $2, $3, date_trunc(\'second\', current_timestamp))';
        const values = [post_id, body, author];
        await pool.query(query, values);

        res.redirect(`/thread/${post_id}`);
    } catch (error) {
        console.error('Error adding comment:', error);
    }
});

app.get('/forum', async (req, res) => {
    const categories = await fetchCategories();
    const userId = req.session.userId;
    const username = req.session.username;
    res.render('forum', { categories, userId, username});
});


app.get('/login', (req, res) => {
    res.render('login'); // make sure you have login.ejs in your views directory
});

// Change the root route to redirect to the login page
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/register', (req, res) => {
    res.render('register');
});


app.post('/add-category', async (req, res) => {
    const { name, description } = req.body; // Extract name and description from the request body

    try {
        // Check if the category already exists to avoid duplicates
        const categoryExistsQuery = 'SELECT * FROM category WHERE name = $1'; // Corrected table name to 'category'
        const categoryExistsResult = await pool.query(categoryExistsQuery, [name]);

        if (categoryExistsResult.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Category already exists." });
        }

        // If the category does not exist, proceed with adding it to the database
        const insertQuery = 'INSERT INTO category(name, description) VALUES ($1, $2)'; // Corrected table name to 'category'
        const values = [name, description];
        await pool.query(insertQuery, values);

        res.redirect('/admin'); // Redirect back to the admin page or to a confirmation page
    } catch (error) {
        console.error('Error adding category:', error);
        res.status(500).json({ success: false, message: "Error adding category." });
    }
});

app.get('/edit-category/:categoryId', async (req, res) => {
    const { categoryId } = req.params;

    try {
        const query = 'SELECT name, description, category_id FROM category WHERE category_id = $1';
        const result = await pool.query(query, [categoryId]);
        if (result.rows.length > 0) {
            const category = result.rows[0];
            res.render('edit-category', { category });
        } else {
            res.send("Category not found.");
        }
    } catch (error) {
        console.error('Error fetching category for edit:', error);
        res.status(500).send('Error fetching category for edit');
    }
});


app.post('/update-category/:categoryId', async (req, res) => {
    const { categoryId } = req.params;
    const { name, description } = req.body;

    try {
        const query = 'UPDATE category SET name = $1, description = $2 WHERE category_id = $3';
        await pool.query(query, [name, description, categoryId]);
        res.redirect('/admin'); // Redirect back to the admin page or to a confirmation page
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).send('Error updating category');
    }
});


app.get('/delete-category/:categoryId', async (req, res) => {
    const { categoryId } = req.params;

    try {
        const query = 'DELETE FROM category WHERE category_id = $1';
        await pool.query(query, [categoryId]);
        res.redirect('/admin');
    } catch (error) {
        console.error('Error deleting category:', error);
        res.redirect('/admin');
    }
});


app.get('/admin', async (req, res) => {
    try {
        // Fetch categories as before
        const categoriesResult = await pool.query('SELECT category_id, name, description FROM category');
        const categories = categoriesResult.rows;

        // Now, fetch users
        const usersResult = await pool.query('SELECT user_id, username, email, role FROM users'); // Adjust the query based on your needs
        const users = usersResult.rows;

        // Render the 'admin' EJS template and pass both categories and users data to it
        res.render('admin', { categories, users });
    } catch (error) {
        console.error('Error fetching data for admin:', error);
        res.status(500).send('Error loading the admin page');
    }
});




app.get('/edit-user/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const query = 'SELECT * FROM users WHERE user_id = $1';
        const result = await pool.query(query, [userId]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.render('edit-user', { user });
        } else {
            res.send("User not found.");
        }
    } catch (error) {
        console.error('Error fetching user for edit:', error);
        res.status(500).send('Error fetching user for edit');
    }
});



app.post('/update-user/:userId', async (req, res) => {
    const { userId } = req.params;
    const { username, email, role } = req.body; 

    try {
        // The SET assignments are separated by commas and the WHERE clause comes after all SET assignments.
        const query = 'UPDATE users SET username = $1, email = $2, role = $3 WHERE user_id = $4';
        await pool.query(query, [username, email, role, userId]);
        res.redirect('/admin'); // Or to any other confirmation page
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).send('Error updating user');
    }
});


app.post('/change-email', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { email } = req.body;
    const userId = req.session.userId;

    try {
        const updateEmailQuery = 'UPDATE users SET email = $1 WHERE user_id = $2';
        await pool.query(updateEmailQuery, [email, userId]);
        res.json({ success: true, message: "Email updated successfully" });
    } catch (error) {
        console.error('Error updating email:', error);
        res.status(500).json({ success: false, message: "Error updating email" });
    }
});


app.post('/change-password', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { password } = req.body;
    const userId = req.session.userId;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const updatePasswordQuery = 'UPDATE users SET password = $1 WHERE user_id = $2';
        await pool.query(updatePasswordQuery, [hashedPassword, userId]);
        res.json({ success: true, message: "Password updated successfully" });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ success: false, message: "Error updating password" });
    }
});





// Start the server
const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
    // Guide to access the web forum
    console.log(`Go to http://localhost:${port}/ to see the web forum.`);
    // Display pgAdmin connection details
    console.log("pgAdmin connection details:");
    console.log(`
    User: '${pool.options.user}',
    Host: '${pool.options.host}',
    Database: '${pool.options.database}',
    Password: '${pool.options.password}',
    Port: ${pool.options.port},
    `);
    // Instructions to change the password
    console.log("To change the password in pgAdmin, execute the following SQL query:");
    console.log(`ALTER USER postgres WITH PASSWORD '${pool.options.password}';`);
});


async function fetchCategories() {
    try {
        const query = 'SELECT category_id, name, description FROM category'; // Ensure your table name is correct
        const result = await pool.query(query);
        return result.rows;
    } catch (error) {
        console.error('Error fetching categories:', error);
        return [];
    }
}

app.post('/change-email', async (req, res) => {
    const newEmail = req.body.email;
    console.log(req.loggedInUserId);  // The ID of the currently logged-in user
    const query = 'UPDATE users SET email = $1 WHERE user_id = $2';
    const values = [newEmail, req.loggedInUserId];

    try {
        await pool.query(query, values);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

app.post('/change-password', async (req, res) => {
    const newPassword = req.body.password;
    // Hash the new password before storing it
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const query = 'UPDATE users SET password = $1 WHERE user_id = $2';
    const values = [hashedPassword, req.loggedInUserId];

    try {
        await pool.query(query, values);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});