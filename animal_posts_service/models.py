from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# Define your animal posts table structure
animal_posts = db.Table('animal_posts',
    db.Column('id', db.Integer, primary_key=True),
    db.Column('title', db.String(100), nullable=False),
    db.Column('description', db.Text, nullable=False),
    db.Column('location', db.String(100), nullable=False),
    db.Column('status', db.String(50), nullable=False),
    db.Column('images', db.String(255), nullable=True)
)
