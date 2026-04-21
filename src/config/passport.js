// src/config/passport.js
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import FacebookStrategy from 'passport-facebook';
import User from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config();

/** User.name requires min length 2 — Google/Facebook profile name can be empty or one character. */
function oauthDisplayName(profile, email) {
  const fromProfile = profile.displayName?.trim();
  const local = email.split('@')[0]?.trim() || '';
  let name = fromProfile || local;
  if (!name || name.length < 2) {
    name = email.length >= 2 ? email : 'User';
  }
  return name.slice(0, 60);
}

// Stateless strategy: no sessions. The verify callback resolves a Mongo user
// and hands it to the route, which issues our own JWT + refresh cookie.
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL || '/api/v1/auth/google/callback',
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) {
          return done(new Error('Google account did not expose an email address'));
        }

        // Match on googleId first, then fall back to email so we can link
        // Google to an existing local account instead of creating a duplicate.
        let user = await User.findOne({
          $or: [{ googleId: profile.id }, { email }],
        }).select('+googleId');

        if (user) {
          if (!user.googleId) {
            user.googleId = profile.id;
            user.authProvider = 'google';
            if (!user.avatar && profile.photos?.[0]?.value) {
              user.avatar = profile.photos[0].value;
            }
            await user.save({ validateBeforeSave: false });
          }
        } else {
          user = await User.create({
            name: oauthDisplayName(profile, email),
            email,
            googleId: profile.id,
            avatar: profile.photos?.[0]?.value || '',
            authProvider: 'google',
          });
        }

        if (!user.active) {
          return done(null, false, { message: 'This account has been deactivated' });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

const facebookOAuthEnabled =
  Boolean(process.env.FACEBOOK_APP_ID) && Boolean(process.env.FACEBOOK_APP_SECRET);

if (facebookOAuthEnabled) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL:
          process.env.FACEBOOK_CALLBACK_URL || '/api/v1/auth/facebook/callback',
        profileFields: ['id', 'displayName', 'photos', 'email'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const rawEmail = profile.emails?.[0]?.value?.toLowerCase();
          const email = rawEmail || `fb_${profile.id}@oauth.facebook`;

          // Match on facebookId first, then email (real or synthetic) to link Facebook
          // to an existing local/Google account without creating a duplicate.
          let user = await User.findOne({
            $or: [{ facebookId: profile.id }, { email }],
          }).select('+googleId +facebookId');

          if (user) {
            if (!user.facebookId) {
              user.facebookId = profile.id;
              user.authProvider = 'facebook';
              if (!user.avatar && profile.photos?.[0]?.value) {
                user.avatar = profile.photos[0].value;
              }
              await user.save({ validateBeforeSave: false });
            }
          } else {
            user = await User.create({
              name: oauthDisplayName(profile, email),
              email,
              facebookId: profile.id,
              avatar: profile.photos?.[0]?.value || '',
              authProvider: 'facebook',
            });
          }

          if (!user.active) {
            return done(null, false, { message: 'This account has been deactivated' });
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

export default passport;
export { facebookOAuthEnabled };
