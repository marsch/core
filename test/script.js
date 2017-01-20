'use strict';

const Botler = require('../lib/index');
const Promise = require('bluebird');

describe('only default script', () => {
  const bot = new Botler.default();
  const tester = new Botler.Platforms.TestPlatform(bot);
  bot.addPlatform(tester);
  bot.start();

  bot.newScript()
    .dialog((incoming, response) => {
      response.sendText('hi');
    });

  it('run', function () {
    return tester.newTest()
      .expectText('hi')
      .run();
  });
});

describe('only greeting script', () => {
  const bot = new Botler.default();
  const tester = new Botler.Platforms.TestPlatform(bot);
  bot.addPlatform(tester);
  bot.start();

  bot.addGreeting((user, response) => {
    response.sendText('hi');
  });

  it('run', function () {
    return tester.newTest()
      .expectText('hi')
      .run();
  });
});

describe('greeting then default', () => {
  const bot = new Botler.default();
  const tester = new Botler.Platforms.TestPlatform(bot);
  bot.addPlatform(tester);
  bot.start();

  bot.addGreeting((user, response) => {
      response.sendText('hey');
    });
  bot.newScript()
    .dialog((incoming, response) => {
      response.sendText('ho');
    });

  it('run', function () {
    return tester.newTest()
      .expectText('hey')
       .expectText('ho')
      .run();
  });
});

