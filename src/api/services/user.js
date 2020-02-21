import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import ServiceError from './common/serviceError';
import config from '../../config/vars';
import db from '../models';

/**
 * @description Format the user data to be returned to the client
 * @param {object} user The raw user data gotten from the database
 * @returns {object} The formatted user data
 */
const formatUserData = user => JSON.parse(JSON.stringify({
  _id: user._id,
  name: user.name,
  phone: user.phone,
  confirmedPhone: user.confirmedPhone,
}));

/**
 * @description The service function that creates an hospital user
 * @param {object} data The hospital user data
 * @param {function} log Logger utility for logging messages
 * @returns {object} The new user
 * @throws {Error} Any error that prevents the service from executing successfully
 */
const createUser = async (data, log) => {
  log.debug('Executing createUser service');
  const {
    name, phone, password,
  } = data;
  log.debug('Checking if a user with the given phone number already exist');
  const alreadyExistingUser = await db.users.getUser(
    { phone },
  );
  if (alreadyExistingUser) {
    log.debug('User with the given phone number already exist, throwing error');
    throw new ServiceError('User with this phone already exist', 409);
  }
  log.debug('Hashing user password');
  const hashedPassword = await bcrypt.hash(password, 10);
  log.debug('Saving user data in database');
  const User = await db.users.createUser({
    name,
    phone,
    password: hashedPassword,
    confirmedPhone: false,
  });
  await db.profile.createProfile({
    userId: User._id,
  });
  return formatUserData(User);
};


/**
 * @description Grants authorization to a valid user.
 * @param {object} data The data required to perform the login operation
 * @param {string} data.email The user email
 * @param {string} data.password The user password
 * @param {string} data.userType The user type
 * @returns {object} The user details and authorization token
 * @throws {Error} Throws an error is operations fails
 */
const login = async (data, log) => {
  log.debug('Executing login service');
  const { phone, password } = data;
  log.debug('Check if a user with the given email exist');
  const user = await db.users.getUser({ phone });
  if (!user || !bcrypt.compareSync(password, user.password)) {
    log.debug('The given phone or password is not correct, throwing error');
    throw new ServiceError('Incorrect phone or password', 400);
  }
  const userId = user._id;
  log.debug('Create an auth token for this user');
  const token = jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: '3d' });
  return { user: formatUserData(user), token };
};

/**
 * @description Updates a user password in the database
 * @param {object} data The data required to execute this service
 * @param {string} data.formerPassword The user former password
 * @param {string} data.formerHashedPassword The user former hashed password
 * @param {string} data.newPassword The new password to set for the user
 * @param {string} data.userId The user id
 * @param {string} data.userType The user type
 * @throws {Error} Throws an error is operations fails
 */
const updatePassword = async (data, log) => {
  log.debug('Executing updatePassword service');
  const {
    formerPassword, newPassword, userId,
  } = data;
  const user = await db.users.getUser({ _id: userId });
  if (!user) {
    log.debug('The user to update does not exist');
    throw new ServiceError('User does not exist', 404);
  }
  if (!bcrypt.compareSync(formerPassword, user.password)) {
    log.debug('The formerPassword is not correct, throwing error');
    throw new ServiceError('Former password is not correct', 400);
  }
  log.debug('Hashing new user password');
  const newHashedPassword = await bcrypt.hash(newPassword, 10);
  log.debug('Updating user password in db');
  await db.users.updateUser({ _id: userId }, { password: newHashedPassword });
};

/**
 * @description The service function that confirms a user account
 * @param {string} regToken The user registeration token
 * @param {function} log Logger utility for logging messages
 * @returns {Promise} A promise that resolves or reject to the db operation to update a user data.
 * @throws {Error} Any error that prevents the service to execute successfully
 */
const confirmUserAccount = async (regToken, log) => {
  log.debug('Executing confirmUserAccount service');
  try {
    log.debug('Verify the registeration token');
    const decoded = jwt.verify(regToken, config.jwtSecrete);
    const { email, userType } = decoded;
    log.debug('Registeration token is valid, update user information in the DB');
    return db.users.updateUser({ email }, { confirmedEmail: true }, userType);
  } catch (err) {
    log.debug('Unable to verify the registeration token, throwing error');
    throw new ServiceError('Registeration token not valid', 400);
  }
};

export default {
  login,
  createUser,
  updatePassword,
  confirmUserAccount,
};