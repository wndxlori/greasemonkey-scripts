// ==UserScript==
// @name         Amazon Kindle Book Downloader
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Adds a button to trigger downloads of all Kindle books on the page
// @author       + Lori Olson
// @match        https://www.amazon.ca/hz/mycd/digital-console/contentlist/booksAll/*
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // Wait until the page is fully loaded before injecting the button
  window.addEventListener('load', function() {
      // Create a button to trigger the action
      const button = document.createElement('button');
      button.innerText = 'Trigger Download';
      button.style.position = 'fixed';
      button.style.top = '20px';
      button.style.right = '20px';
      button.style.padding = '10px';
      button.style.fontSize = '16px';
      button.style.backgroundColor = '#4CAF50';
      button.style.color = 'white';
      button.style.border = 'none';
      button.style.borderRadius = '5px';
      button.style.cursor = 'pointer';
      button.style.zIndex = 9999;

      // Add button to the body
      document.body.appendChild(button);

      // Function to simulate clicking an element
      function clickElement(selector) {
        clickElementWithin(document, selector);
      }

      function clickElementWithin(topElement, selector) {
        const element = topElement.querySelector(selector);
        if (element) {
            element.click();
            console.log(`Clicked: ${selector}`);
        } else {
            console.log(`Element not found: ${selector}`);
        }
    }

      // Function to handle processing of each dropdown
      async function processDropdowns() {
          // Get all dropdowns with the class prefix 'Dropdown-module_container__'
          const dropdowns = document.querySelectorAll('[class^="Dropdown-module_container__"]');

          for (let i = 0; i < dropdowns.length; i++) {
              // Open the dropdown
              const dropdown = dropdowns[i];
              dropdown.click();
              console.log(`Dropdown ${i+1} opened`);

              // Wait a moment for the dropdown to open and perform the actions
              await new Promise(resolve => setTimeout(resolve, 500));

              // Now perform the actions on the opened dropdown using wildcard selectors
              await new Promise(resolve => setTimeout(() => {
                  clickElement('[id^="MARK_AS_READ_ACTION_"]'); // Mark as Read
                  resolve();
              }, 500));

              await new Promise(resolve => setTimeout(() => {
                  clickElementWithin(dropdown, '[id^="DOWNLOAD_AND_TRANSFER_ACTION_"]'); // Download & Transfer via USB
                  resolve();
              }, 500));

              await new Promise(resolve => setTimeout(() => {
                  clickElementWithin(dropdown, 'span[id^="download_and_transfer_list_"]'); // First Kindle in list
                  resolve();
              }, 500));

              await new Promise(resolve => setTimeout(() => {
                  clickElementWithin(dropdown, '[id^="DOWNLOAD_AND_TRANSFER_ACTION_"][id$="_CONFIRM"]'); // Confirm Download & Transfer
                  resolve();
              }, 500));

              await new Promise(resolve => setTimeout(() => {
                  clickElement('span[id="notification-close"]'); // Close success screen
                  resolve();
              }, 500));

              // Wait a little before processing the next dropdown
              await new Promise(resolve => setTimeout(resolve, 14000));
          }

          console.log('All dropdowns processed');
      }

      // Button click event to start processing all dropdowns
      button.addEventListener('click', function() {
          processDropdowns();
      });
  });

  // Optional: Add some CSS to make the button look nice
  GM_addStyle(`
      button {
          font-family: Arial, sans-serif;
          box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
      }
  `);
})();
