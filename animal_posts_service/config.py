import os

SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///animal_posts.db')
SQLALCHEMY_TRACK_MODIFICATIONS = False
