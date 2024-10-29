// ==UserScript==
// @name         Amazon Kindle Deals Goodreads Ratings (Per Section)
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Add Goodreads ratings to Amazon Kindle deals page for specific sections with highlighting
// @match        https://www.amazon.com/*
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Configurable variables
    let debugMode = true;

    // Rating thresholds and colors
    const ratingThresholds = [4.00, 4.30, 4.50];
    const ratingColors = ['#e6ffe6', '#ccffcc', '#99ff99']; // Light to dark green

    // Review count thresholds and colors
    const reviewCountThresholds = [1000, 5000, 10000];
    const reviewCountColors = ['#e6ffe6', '#ccffcc', '#99ff99']; // Light to dark green

    const longTitleLength = 42;

    let bookData = [];
    let processedASINs = new Set();
    let linksToProcess = [];
    let currentLinkIndex = 0;
    let isPaused = false;
    let isProcessing = false;

    function log(message) {
        if (debugMode) {
            console.log(`[Goodreads Ratings Debug]: ${message}`);
        }
    }

    function getASIN(url) {
        const match = url.match(/\/([A-Z0-9]{10})(?:\/|\?|$)/);
        return match ? match[1] : null;
    }

    function extractYear(text) {
        const yearRegex = /\b\d{4}\b/; // Regular expression to match a four-digit year
        const match = text.match(yearRegex);
        return match ? parseInt(match[0]) : '';
    }

    function isShelved(container) {
        const buttons = container.querySelectorAll('button');

        return Array.from(buttons).some(button => {
            const label = button.getAttribute('aria-label');
            return label && label.includes('Shelved');
        });
    }

    function getLiteraryAwards(doc) {
        if (doc) {
            const scripts = doc.getElementsByTagName('script');

            let awardsData = null;

            // Iterate through scripts to find the one containing awards data
            for (let script of scripts) {
                const content = script.textContent || script.innerText;
                if (content.includes('"awards":')) {
                    // This script likely contains our data
                    const match = content.match(/"awards":\s*"([^"]*)"/);
                    if (match) {
                        try {
                            awardsData = match[1];
                            break;
                        } catch (e) {
                            console.error("Error parsing awards data:", e);
                        }
                    }
                }
            }

            return awardsData;
        } else {
            return null;
        }
    }

    function getUniqueBookLinks(container) {
        const uniqueLinks = [];
        const seenHrefs = new Set();

        // Kindle Deals page
        const sections = container.querySelectorAll('div[data-testid="asin-face"], .ubf-book-info');

        sections.forEach(asinFace => {
            const link = asinFace.querySelector('a');
            if (link && !seenHrefs.has(link.href)) {
                seenHrefs.add(link.href);
                uniqueLinks.push(link);
            }
        });


        // Regular Kindle page
        const bookFaceouts = container.querySelectorAll('bds-unified-book-faceout');

        bookFaceouts.forEach(faceout => {
            const shadowRoot = faceout.shadowRoot;
            if (shadowRoot) {
                const link = shadowRoot.querySelector('a');
                if (link && !seenHrefs.has(link.href)) {
                    seenHrefs.add(link.href);
                    uniqueLinks.push(link);
                }
            }
        });

        log(`Unique link count: ${uniqueLinks.length}`);

        return uniqueLinks;
    }

    function fetchGoodreadsData(asin) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (isPaused) {
                    resolve(null);
                    return;
                }
                log(`Fetching data for ASIN: ${asin}`);
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://www.goodreads.com/book/isbn/${asin}`,
                    onload: function(response) {
                        log(`Received response for ASIN: ${asin}`);
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, "text/html");

                        const h1Element = doc.querySelector('h1[data-testid="bookTitle"]');
                        const metadataElement = doc.querySelector('.RatingStatistics__rating');

                        if (!h1Element || !metadataElement) {
                            log(`No results found for ASIN: ${asin}`);
                            resolve(null);
                            return;
                        }

                        const fullTitle = h1Element.textContent.trim();
                        const title = fullTitle.length > longTitleLength ? fullTitle.slice(0, longTitleLength) + '...' : fullTitle;
                        const rating = metadataElement.textContent.trim().replace(/\s*stars/, '');
                        const ratingsCountElement = doc.querySelector('[data-testid="ratingsCount"]');
                        const ratingsCount = ratingsCountElement ? ratingsCountElement.textContent.trim().split(' ')[0] : '0';
                        const reviewsCountElement = doc.querySelector('[data-testid="reviewsCount"]');
                        const reviewsCount = reviewsCountElement ? reviewsCountElement.textContent.trim().split(' ')[0] : '0';

                        // Extract the first genre
                        const genreElement = doc.querySelector('.BookPageMetadataSection__genreButton a');
                        const genre = genreElement ? genreElement.textContent.trim() : 'Unknown';

                        // Extract the publication year
                        const publicationElement = doc.querySelector('p[data-testid="publicationInfo"]');
                        const publicationYear = publicationElement ? extractYear(publicationElement.textContent.trim()) : '';

                        // Is it on a shelf already?
                        const actionsElement = doc.querySelector('.BookPageMetadataSection__mobileBookActions');
                        const onShelf = isShelved(actionsElement);

                        const awards = getLiteraryAwards(doc);

                        const data = {
                            asin: asin,
                            title: title || "Unknown Title",
                            fullTitle: fullTitle,
                            longTitle: fullTitle.length > longTitleLength,
                            rating: rating,
                            ratingsCount: ratingsCount,
                            reviewsCount: reviewsCount,
                            genre: genre,
                            goodreadsUrl: `https://www.goodreads.com/book/isbn/${asin}`,
                            publicationYear: publicationYear,
                            onShelf: onShelf,
                            awards: awards
                        };
                        log(`Parsed data for ${data.title}: ${JSON.stringify(data)}`);
                        resolve(data);
                    },
                    onerror: function(error) {
                        log(`Error fetching data for ASIN: ${asin}`);
                        reject(error);
                    }
                });
            }, 250);
        });
    }

    function getRatingColor(rating) {
        rating = parseFloat(rating);
        for (let i = ratingThresholds.length - 1; i >= 0; i--) {
            if (rating >= ratingThresholds[i]) {
                return ratingColors[i];
            }
        }
        return '';
    }

    function getReviewCountColor(count) {
        count = parseInt(count.replace(/,/g, ''));
        for (let i = reviewCountThresholds.length - 1; i >= 0; i--) {
            if (count >= reviewCountThresholds[i]) {
                return reviewCountColors[i];
            }
        }
        return '';
    }

    function addUIElement(books, isLoading = false) {
        let container = document.getElementById('goodreads-ratings');
        if (!container) {
            container = document.createElement('div');
            container.id = 'goodreads-ratings';
            container.style.position = 'fixed';
            container.style.top = '10px';
            container.style.right = '10px';
            container.style.backgroundColor = 'white';
            container.style.padding = '10px';
            container.style.border = '1px solid black';
            container.style.zIndex = '9999';
            container.style.maxHeight = '80vh';
            container.style.overflowY = 'auto';
            document.body.appendChild(container);
        }

        // Clear previous content
        container.innerHTML = '';

        const headerContainer = document.createElement('div');
        headerContainer.style.display = 'flex';
        headerContainer.style.justifyContent = 'space-between';
        headerContainer.style.alignItems = 'center';
        headerContainer.style.marginBottom = '10px';

        const title = document.createElement('h3');
        title.textContent = 'Goodreads Ratings';
        title.style.margin = '0';
        headerContainer.appendChild(title);

        // Add pause/resume button only if there are links to process
        if (linksToProcess.length > 0) {
            const pauseResumeButton = document.createElement('button');
            pauseResumeButton.textContent = isPaused ? 'Resume' : 'Pause';
            pauseResumeButton.addEventListener('click', togglePauseResume);
            headerContainer.appendChild(pauseResumeButton);
        }

        container.appendChild(headerContainer);

        const statusMessage = document.createElement('p');
        if (isPaused) {
            statusMessage.textContent = 'Processing paused';
        } else if (isLoading) {
            statusMessage.textContent = `Processing... (${currentLinkIndex} of ${linksToProcess.length} books processed)`;
        } else if (books.length === 0) {
            statusMessage.textContent = 'No books processed yet';
        } else {
            statusMessage.textContent = 'Processing finished!';
        }
        container.appendChild(statusMessage);

        const table = document.createElement('table');
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';

        // Create table header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Title', 'Price', 'Rating', 'Rating Count', 'Review Count', 'Genre', 'Year'].forEach(headerText => {
            const th = document.createElement('th');
            th.textContent = headerText;
            th.style.border = '1px solid gray';
            th.style.padding = '5px';
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create table body
        const tbody = document.createElement('tbody');
        books.forEach(book => {
            if (book) {
                const row = document.createElement('tr');

                // Title cell
                const titleCell = document.createElement('td');
                const link = document.createElement('a');
                link.href = book.goodreadsUrl;
                link.target = '_blank';
                link.textContent = book.onShelf ? `⭐ ${book.title}` : book.title;
                if (book.longTitle) {
                    link.title = book.fullTitle;
                }
                titleCell.appendChild(link);
                titleCell.style.border = '1px solid gray';
                titleCell.style.padding = '5px';
                row.appendChild(titleCell);

                // Price cell
                const priceCell = document.createElement('td');
                const priceLink = document.createElement('a');
                priceLink.href = `https://www.amazon.com/dp/${book.asin}`;
                priceLink.target = '_blank';
                priceLink.textContent = book.price.replace(/^(?!\$)/, '$') || 'N/A'; // Add leading $ sign
                if (book.awards) {
                    priceLink.textContent = `🏅 ${priceLink.textContent}`;
                    priceLink.title = book.awards;
                }
                priceCell.appendChild(priceLink);
                priceCell.style.border = '1px solid gray';
                priceCell.style.padding = '5px';
                priceCell.style.textAlign = 'right';
                row.appendChild(priceCell);

                // Rating cell
                const ratingCell = document.createElement('td');
                ratingCell.textContent = book.rating;
                ratingCell.style.backgroundColor = getRatingColor(book.rating);
                ratingCell.style.border = '1px solid gray';
                ratingCell.style.padding = '5px';
                ratingCell.style.textAlign = 'right';
                row.appendChild(ratingCell);

                // Ratings count cell
                const ratingsCountCell = document.createElement('td');
                ratingsCountCell.textContent = book.ratingsCount;
                ratingsCountCell.style.backgroundColor = getReviewCountColor(book.ratingsCount);
                ratingsCountCell.style.border = '1px solid gray';
                ratingsCountCell.style.padding = '5px';
                ratingsCountCell.style.textAlign = 'right';
                row.appendChild(ratingsCountCell);

                // Reviews count cell
                const reviewsCountCell = document.createElement('td');
                reviewsCountCell.textContent = book.reviewsCount;
                reviewsCountCell.style.border = '1px solid gray';
                reviewsCountCell.style.padding = '5px';
                reviewsCountCell.style.textAlign = 'right';
                row.appendChild(reviewsCountCell);

                // Genre cell
                const genreCell = document.createElement('td');
                genreCell.textContent = book.genre;
                genreCell.style.border = '1px solid gray';
                genreCell.style.padding = '5px';
                row.appendChild(genreCell);

                // Genre cell
                const publicationCell = document.createElement('td');
                publicationCell.textContent = book.publicationYear;
                publicationCell.style.border = '1px solid gray';
                publicationCell.style.padding = '5px';
                row.appendChild(publicationCell);

                tbody.appendChild(row);
            }
        });
        table.appendChild(tbody);

        container.appendChild(table);
    }

    function addBookAndSort(newBook) {
        if (newBook && !processedASINs.has(newBook.asin)) {
            bookData.push(newBook);
            processedASINs.add(newBook.asin);
            bookData.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
            addUIElement(bookData, linksToProcess.length > currentLinkIndex);
        }
    }

    async function processBooks() {
        while (currentLinkIndex < linksToProcess.length && !isPaused) {
            const link = linksToProcess[currentLinkIndex];
            const asin = getASIN(link.href);

            currentLinkIndex++;

            if (asin && !processedASINs.has(asin)) {
                try {
                    log(`---- Processing book ${currentLinkIndex} of ${linksToProcess.length} ----`);
                    const data = await fetchGoodreadsData(asin);
                    if (data) {
                        // Kindle Deals pages
                        const asinFace = link.closest('[data-testid="asin-face"]');
                        if (asinFace) {
                            const priceElement = asinFace && asinFace.querySelector('[data-testid="price"]');
                            if (priceElement) {
                                const priceTextContent = priceElement.textContent;
                                const priceMatch = priceTextContent.match(/Deal price: \$(\d+\.\d+)/);
                                data.price = priceMatch ? priceMatch[1] : 'N/A';
                            }
                        }
                        // Regular Kindle page
                        if (!data.price) {
                            const sibling = link.nextElementSibling;
                            if (sibling) {
                                const bookPrice = sibling.querySelector('bds-book-price');
                                if (bookPrice) {
                                    data.price = bookPrice.getAttribute('unstylizedprice');
                                }
                            }
                        }
                        if (!data.price) {
                            data.price = 'N/A';
                        }
                        addBookAndSort(data);
                    }
                } catch (error) {
                    console.error('Error fetching Goodreads data:', error);
                }
            }
        }

        if (currentLinkIndex >= linksToProcess.length) {
            log('All books processed');
            addUIElement(bookData, false);
        }
    }

    function togglePauseResume() {
        isPaused = !isPaused;
        if (!isPaused) {
            processBooks();
        }
        addUIElement(bookData, !isPaused);
    }

    function addButtonToSection(section) {
        const button = document.createElement('button');
        button.textContent = 'Get Goodreads Ratings';
        button.style.margin = '10px';
        button.addEventListener('click', async function() {
            this.disabled = true;

            const newLinks = getUniqueBookLinks(section);
            linksToProcess.push(...newLinks.filter(link => !processedASINs.has(getASIN(link.href))));

            if (!isProcessing) {
                isProcessing = true;
                addUIElement(bookData, true);

                try {
                    await processBooks();
                } finally {
                    isProcessing = false;
                }
            }
        });
        section.insertBefore(button, section.firstChild);
    }

    function initializeScript() {
        const addButtonsToSections = () => {
            const sections = document.querySelectorAll('div[data-testid="asin-faceout-shoveler.card-cont"]:not([data-goodreads-processed]), div[data-testid="mfs-container.hor-scroll"]:not([data-goodreads-processed])');
            sections.forEach(section => {
                addButtonToSection(section);
                section.setAttribute('data-goodreads-processed', 'true');
            });
            if (sections.length > 0) {
                log(`Buttons added to ${sections.length} new sections`);
            }
        };

        // Initial run
        addButtonsToSections();

        // Set up a MutationObserver to watch for new sections
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    addButtonsToSections();
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        log('Script initialized and watching for new sections');
    }

    // Run the script when the page is fully loaded
    if (document.readyState === 'complete') {
        initializeScript();
    } else {
        window.addEventListener('load', initializeScript);
    }

    log('Script setup complete');
})();
